/**
 * 统一 Agent 示例
 * 展示如何使用统一的 Agent 接口
 * 无论是智谱 AI 还是官方 API，用法完全一致
 */

import { createAgent, query } from "./agent";
import { env } from "./config";

// ==================== 示例 1: 基础对话 ====================

async function example1_basic() {
  console.log("\n========== 示例 1: 基础对话 ==========\n");

  const response = await query("你好！请介绍一下你自己。");
  console.log(response);
}

// ==================== 示例 2: 使用工具 ====================

async function example2_withTools() {
  console.log("\n========== 示例 2: 使用工具 ==========\n");

  const agent = createAgent();

  const response = await agent.run(
    "请创建一个名为 hello.txt 的文件，内容是 'Hello from Claude!'",
    {
      onMessage: (msg) => process.stdout.write(msg),
      onToolUse: (name, input) => console.log(`\n🔧 使用工具: ${name}`),
      onToolResult: (name, result) => {
        if (result.success) {
          console.log(`   ✅ ${result.content}`);
        } else {
          console.log(`   ❌ ${result.error}`);
        }
      },
    }
  );

  console.log("\n最终回复:", response);
}

// ==================== 示例 3: 多轮对话 ====================

async function example3_multiTurn() {
  console.log("\n========== 示例 3: 多轮对话 ==========\n");

  const agent = createAgent();

  // 第一轮
  console.log("👤 用户: 创建一个文件 numbers.txt，写入数字 1-5");
  await agent.run("创建一个文件 numbers.txt，写入数字 1-5，每行一个", {
    onMessage: (msg) => process.stdout.write(msg),
  });

  // 第二轮
  console.log("\n👤 用户: 读取刚才创建的文件");
  await agent.run("读取 numbers.txt 文件的内容", {
    onMessage: (msg) => process.stdout.write(msg),
  });

  // 第三轮
  console.log("\n👤 用户: 修改文件，把 3 改成 100");
  await agent.run("把文件中的 3 改成 100", {
    onMessage: (msg) => process.stdout.write(msg),
  });
}

// ==================== 示例 4: 流式输出 ====================

async function example4_stream() {
  console.log("\n========== 示例 4: 流式输出 ==========\n");

  const agent = createAgent();

  for await (const chunk of agent.stream("列出当前目录的所有文件")) {
    if (chunk.type === "text") {
      process.stdout.write(chunk.data);
    } else if (chunk.type === "tool_use") {
      console.log(`\n🔧 ${chunk.data.name}`);
    } else if (chunk.type === "tool_result") {
      const { name, result } = chunk.data;
      console.log(`   ${result.success ? "✅" : "❌"} ${result.content || result.error}`);
    } else if (chunk.type === "done") {
      console.log("\n✨ 完成！");
    }
  }
}

// ==================== 示例 5: 自定义工具 ====================

async function example5_customTool() {
  console.log("\n========== 示例 5: 自定义工具 ==========\n");

  const agent = createAgent();

  // 添加自定义工具
  agent.onTool("calculate", async (input) => {
    const { expression } = input;
    try {
      // 安全的数学表达式计算
      const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, "");
      const result = Function(`"use strict"; return (${sanitized})`)();
      return {
        success: true,
        content: `${expression} = ${result}`,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  agent.addTool({
    name: "calculate",
    description: "计算数学表达式",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "数学表达式，如 2+3*4" },
      },
      required: ["expression"],
    },
  });

  const response = await agent.run("请计算 123 * 456 + 789", {
    onMessage: (msg) => process.stdout.write(msg),
    onToolUse: (name, input) => console.log(`\n🔧 计算: ${input.expression}`),
  });

  console.log("\n结果:", response);
}

// ==================== 运行所有示例 ====================

async function main() {
  console.log("=".repeat(50));
  console.log(`🤖 Claude Agent 统一示例`);
  console.log(`📡 API: ${env.ANTHROPIC_BASE_URL}`);
  console.log(`🎯 模型: ${env.ANTHROPIC_MODEL}`);
  console.log("=".repeat(50));

  // 运行示例（可以注释掉不需要的）
  await example1_basic();
  await example2_withTools();
  await example3_multiTurn();
  await example4_stream();
  await example5_customTool();

  console.log("\n" + "=".repeat(50));
  console.log("✨ 所有示例运行完成！");
}

main().catch(console.error);
