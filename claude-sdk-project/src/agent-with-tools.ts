/**
 * 带工具的 Claude Agent 示例
 * 演示如何让代理使用文件操作和终端工具
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

async function runAgentWithTools() {
  console.log("🛠️  启动带工具的 Claude Agent...\n");

  // 创建一个工作目录
  const workspaceDir = join(process.cwd(), "workspace");
  await mkdir(workspaceDir, { recursive: true });

  // 创建一个测试文件
  const testFile = join(workspaceDir, "hello.txt");
  await writeFile(testFile, "Hello World");

  console.log(`✅ 创建工作目录和测试文件: ${testFile}\n`);

  // 运行代理，让它读取和修改文件
  for await (const message of query({
    prompt: `请读取 workspace/hello.txt 文件，然后把内容改为 "你好，Claude Agent SDK！"`,
    options: {
      allowedTools: ["Read", "Write", "Edit"],
      permissionMode: "acceptEdits", // 自动接受编辑
    },
  })) {
    if (message.type === "content") {
      console.log(message.content);
    } else if (message.type === "tool_use") {
      console.log(`[工具] ${message.name}`);
    }
  }

  console.log("\n✨ 完成！");
}

runAgentWithTools().catch(console.error);
