/**
 * 带 Hooks 的 Claude Agent 示例
 * 演示如何使用 hooks 在代理生命周期的关键时刻执行自定义代码
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

async function runAgentWithHooks() {
  console.log("🪝 启动带 Hooks 的 Claude Agent...\n");

  // 计数器
  let toolUseCount = 0;
  const start = Date.now();

  for await (const message of query({
    prompt: "请列出当前目录下的所有 TypeScript 文件",
    options: {
      allowedTools: ["Glob", "Read"],
      permissionMode: "default",
      // Hooks - 在关键生命周期点执行自定义代码
      hooks: {
        // 工具使用前调用
        preToolUse: async (toolUse) => {
          toolUseCount++;
          console.log(`[Hook] 准备使用工具: ${toolUse.name}`);
          return toolUse; // 可以修改 toolUse 或抛出错误阻止执行
        },

        // 工具使用后调用
        postToolUse: async (toolUse, result) => {
          console.log(`[Hook] 工具 ${toolUse.name} 执行完成`);
        },

        // 会话结束时调用
        sessionEnd: async () => {
          const duration = ((Date.now() - start) / 1000).toFixed(2);
          console.log(`\n[Hook] 会话结束`);
          console.log(`[Hook] 总共使用了 ${toolUseCount} 次工具`);
          console.log(`[Hook] 耗时 ${duration} 秒`);
        },
      },
    },
  })) {
    if (message.type === "content") {
      console.log(message.content);
    }
  }

  console.log("\n✨ 完成！");
}

runAgentWithHooks().catch(console.error);
