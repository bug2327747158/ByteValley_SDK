/**
 * 基础 Claude Agent 示例
 * 演示如何创建一个简单的 AI 代理
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

async function runBasicAgent() {
  console.log("🤖 启动 Claude Agent...\n");

  // 运行一个简单的查询
  for await (const message of query({
    prompt: "你好！请介绍一下你自己。",
    options: {
      allowedTools: [], // 不使用任何工具，纯对话
    },
  })) {
    // 打印返回的消息
    if (message.type === "content") {
      console.log(message.content);
    } else if (message.type === "tool_use") {
      console.log(`[工具使用] ${message.name}`);
    }
  }
}

runBasicAgent().catch(console.error);
