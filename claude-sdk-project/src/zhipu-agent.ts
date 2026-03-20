/**
 * 智谱 AI Agent 示例
 * 使用智谱 AI 的 API 端点
 */

import Anthropic from "@anthropic-ai/sdk";
import { env } from "./config";

// 初始化 Anthropic 客户端
const client = new Anthropic({
  baseURL: env.ANTHROPIC_BASE_URL,
  apiKey: env.ANTHROPIC_AUTH_TOKEN,
  maxRetries: 2,
  timeout: env.API_TIMEOUT_MS,
});

async function runZhipuAgent() {
  console.log("🤖 启动智谱 AI Agent...\n");

  try {
    const response = await client.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: "你好！请介绍一下你自己，以及你能做什么。",
        },
      ],
    });

    // 打印回复
    for (const block of response.content) {
      if (block.type === "text") {
        console.log(block.text);
      }
    }

    console.log("\n✅ 使用 tokens:", response.usage);
  } catch (error) {
    console.error("❌ 错误:", error);
  }
}

runZhipuAgent();
