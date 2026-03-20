/**
 * 智谱 AI Agent - 带工具调用
 * 演示如何使用工具调用功能
 */

import Anthropic from "@anthropic-ai/sdk";
import { env } from "./config";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

// 初始化客户端
const client = new Anthropic({
  baseURL: env.ANTHROPIC_BASE_URL,
  apiKey: env.ANTHROPIC_AUTH_TOKEN,
  maxRetries: 2,
  timeout: env.API_TIMEOUT_MS,
});

// 定义可用工具
const tools = [
  {
    name: "read_file",
    description: "读取文件内容",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "文件路径",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "写入文件内容",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "文件路径",
        },
        content: {
          type: "string",
          description: "文件内容",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_files",
    description: "列出目录中的文件",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "目录路径",
        },
      },
      required: ["path"],
    },
  },
];

// 工具实现
async function executeTool(name: string, input: any) {
  switch (name) {
    case "read_file":
      try {
        const content = await readFile(input.path, "utf-8");
        return { success: true, content };
      } catch (error: any) {
        return { success: false, error: error.message };
      }

    case "write_file":
      try {
        // 确保目录存在
        const dir = join(process.cwd(), input.path);
        await mkdir(dir, { recursive: true });
        await writeFile(input.path, input.content, "utf-8");
        return { success: true, message: `文件已写入: ${input.path}` };
      } catch (error: any) {
        return { success: false, error: error.message };
      }

    case "list_files":
      try {
        const { execSync } = require("child_process");
        const files = execSync(`ls -la ${input.path || "."}`, { encoding: "utf-8" });
        return { success: true, files };
      } catch (error: any) {
        return { success: false, error: error.message };
      }

    default:
      return { success: false, error: `未知工具: ${name}` };
  }
}

async function runAgentWithTools() {
  console.log("🛠️  启动智谱 AI Agent (带工具)...\n");

  // 创建工作目录
  const workspaceDir = join(process.cwd(), "workspace");
  await mkdir(workspaceDir, { recursive: true });

  // 创建示例文件
  await writeFile(join(workspaceDir, "demo.txt"), "Hello from Claude SDK!", "utf-8");
  console.log("✅ 创建工作目录和示例文件\n");

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: "请读取 workspace/demo.txt 文件，然后把内容改成'你好，智谱 AI！'",
    },
  ];

  try {
    // 对话循环
    while (true) {
      const response = await client.messages.create({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 4096,
        tools,
        messages,
      });

      // 处理响应
      let hasToolUse = false;

      for (const block of response.content) {
        if (block.type === "text") {
          console.log(`\n📝 Claude: ${block.text}`);
        } else if (block.type === "tool_use") {
          hasToolUse = true;
          console.log(`\n🔧 工具调用: ${block.name}`);

          // 执行工具
          const result = await executeTool(block.name, block.input);

          // 添加工具结果到消息历史
          messages.push({
            role: "assistant",
            content: [block],
          });
          messages.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify(result, null, 2),
              },
            ],
          });

          console.log(`   结果:`, result);
        }
      }

      // 如果没有工具调用，对话结束
      if (!hasToolUse) {
        console.log("\n✨ 完成！");
        break;
      }
    }
  } catch (error) {
    console.error("❌ 错误:", error);
  }
}

runAgentWithTools();
