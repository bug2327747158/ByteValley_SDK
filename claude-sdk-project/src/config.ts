/**
 * 环境配置
 * 支持智谱 AI API 和其他 Anthropic 兼容的 API
 */

import { config } from "dotenv";

// 加载环境变量
config();

export const env = {
  // API 配置
  ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN || "",
  ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",

  // 超时配置
  API_TIMEOUT_MS: parseInt(process.env.API_TIMEOUT_MS || "120000"),

  // 其他配置
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC === "1",
  CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1",
};

// 验证必需的配置
if (!env.ANTHROPIC_AUTH_TOKEN) {
  console.warn("⚠️  警告: 未设置 ANTHROPIC_AUTH_TOKEN");
}

console.log(`📋 使用 API: ${env.ANTHROPIC_BASE_URL}`);
console.log(`🤖 使用模型: ${env.ANTHROPIC_MODEL}`);
