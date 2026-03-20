/**
 * 多 Agent 示例
 * 演示如何同时运行多个独立的 Agent
 */

import { createAgent } from "./agent";

// ==================== 示例 1: 多个独立 Agent ====================

async function example1_multipleAgents() {
  console.log("\n========== 示例 1: 多个独立 Agent ==========\n");

  // 创建 3 个不同用途的 Agent
  const coder = createAgent();
  const writer = createAgent();
  const analyst = createAgent();

  // 每个 Agent 有独立的对话历史
  console.log("👨‍💻 代码专家正在工作...");
  const codeResult = await coder.run("用 Python 写一个计算斐波那契数列的函数", {
    onMessage: (msg) => console.log(msg),
  });

  console.log("\n✍️ 作家正在工作...");
  const writeResult = await writer.run("写一首关于春天的诗", {
    onMessage: (msg) => console.log(msg),
  });

  console.log("\n📊 分析师正在工作...");
  const analysisResult = await analyst.run("分析一下 TypeScript 相比 JavaScript 的优势", {
    onMessage: (msg) => console.log(msg),
  });
}

// ==================== 示例 2: 并行执行 ====================

async function example2_parallelExecution() {
  console.log("\n========== 示例 2: 并行执行多个 Agent ==========\n");

  const agent1 = createAgent();
  const agent2 = createAgent();
  const agent3 = createAgent();

  // 并行执行（同时发起请求）
  const startTime = Date.now();

  const results = await Promise.all([
    agent1.run("什么是 React？", {
      onMessage: (msg) => console.log("[Agent1]", msg.slice(0, 50) + "..."),
    }),
    agent2.run("什么是 Vue？", {
      onMessage: (msg) => console.log("[Agent2]", msg.slice(0, 50) + "..."),
    }),
    agent3.run("什么是 Angular？", {
      onMessage: (msg) => console.log("[Agent3]", msg.slice(0, 50) + "..."),
    }),
  ]);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n⏱️  3 个 Agent 并行执行完成，耗时 ${duration} 秒`);

  return results;
}

// ==================== 示例 3: Agent 团队协作 ====================

async function example3_agentTeam() {
  console.log("\n========== 示例 3: Agent 团队协作 ==========\n");

  // 研究员 - 收集信息
  const researcher = createAgent();
  const research = await researcher.run("总结一下人工智能的发展历史（100字以内）", {
    onMessage: (msg) => console.log("🔍 研究员:", msg),
  });

  // 作者 - 基于研究结果写作
  const author = createAgent();
  const article = await author.run(
    `基于以下研究成果，写一篇简短的文章：\n${research}`,
    {
      onMessage: (msg) => console.log("\n✍️  作者:", msg),
    }
  );

  // 编辑 - 审核和修改
  const editor = createAgent();
  const final = await editor.run(
    `请审核并改进这篇文章，使其更加通顺：\n${article}`,
    {
      onMessage: (msg) => console.log("\n📝 编辑:", msg),
    }
  );
}

// ==================== 示例 4: 分工明确的专家团队 ====================

async function example4_specializedTeam() {
  console.log("\n========== 示例 4: 专家团队 ==========\n");

  // 创建不同配置的 Agent
  const frontendExpert = createAgent({
    model: process.env.ANTHROPIC_MODEL || "glm-4.7",
  });

  const backendExpert = createAgent({
    model: process.env.ANTHROPIC_MODEL || "glm-4.7",
  });

  const devopsExpert = createAgent({
    model: process.env.ANTHROPIC_MODEL || "glm-4.7",
  });

  // 前端专家设计界面
  const frontend = await frontendExpert.run(
    "设计一个待办事项应用的前端界面描述（React + TypeScript）",
    {
      onMessage: (msg) => console.log("🎨 前端专家:", msg),
    }
  );

  // 后端专家设计 API
  const backend = await backendExpert.run(
    "设计待办事项应用的 REST API 接口（Node.js + Express）",
    {
      onMessage: (msg) => console.log("\n⚙️  后端专家:", msg),
    }
  );

  // DevOps 专家设计部署方案
  const devops = await devopsExpert.run(
    "设计这个应用的 Docker 部署方案",
    {
      onMessage: (msg) => console.log("\n🐳 DevOps 专家:", msg),
    }
  );
}

// ==================== 示例 5: Agent 竞争 ====================

async function example5_agentCompetition() {
  console.log("\n========== 示例 5: Agent 方案竞争 ==========\n");

  // 让 3 个 Agent 分别给出解决方案
  const agentA = createAgent();
  const agentB = createAgent();
  const agentC = createAgent();

  const problem = "如何优化一个慢速的数据库查询？";

  console.log(`❓ 问题: ${problem}\n`);

  const solutions = await Promise.all([
    agentA.run(problem, {
      onMessage: (msg) => console.log("🅰️  方案 A:", msg),
    }),
    agentB.run(problem, {
      onMessage: (msg) => console.log("\n🅱️  方案 B:", msg),
    }),
    agentC.run(problem, {
      onMessage: (msg) => console.log("\n©️  方案 C:", msg),
    }),
  ]);

  // 总结者整合方案
  const summarizer = createAgent();
  await summarizer.run(
    `请整合以下三种方案，给出一个最佳的综合解决方案：\n\n方案A: ${solutions[0].slice(0, 100)}...\n\n方案B: ${solutions[1].slice(0, 100)}...\n\n方案C: ${solutions[2].slice(0, 100)}...`,
    {
      onMessage: (msg) => console.log("\n\n🏆 最佳综合方案:", msg),
    }
  );
}

// ==================== 示例 6: 流式多 Agent ====================

async function example6_streamingMultiAgent() {
  console.log("\n========== 示例 6: 流式多 Agent ==========\n");

  const agents = [createAgent(), createAgent(), createAgent()];
  const prompts = [
    "解释什么是闭包",
    "解释什么是原型链",
    "解释什么是事件循环",
  ];

  // 同时启动 3 个流式 Agent
  const streams = agents.map((agent, i) => agent.stream(prompts[i]));

  // 交替输出（模拟聊天室）
  for await (const result of runStreamsWithProgress(streams, ["Agent A", "Agent B", "Agent C"])) {
    console.log(result);
  }
}

// 辅助函数：交替运行多个流
async function* runStreamsWithProgress(
  streams: AsyncGenerator<any, void, unknown>[],
  names: string[]
) {
  const iterators = streams.map((s, i) => ({ name: names[i], stream: s }));

  while (iterators.length > 0) {
    for (let i = iterators.length - 1; i >= 0; i--) {
      const { name, stream } = iterators[i];
      const { value, done } = await stream.next();

      if (done) {
        iterators.splice(i, 1);
      } else if (value.type === "text") {
        yield `[${name}]: ${value.data.slice(0, 80)}...`;
      }
    }
  }
}

// ==================== 主函数 ====================

async function main() {
  console.log("=".repeat(60));
  console.log("🤖 多 Agent 演示");
  console.log("=".repeat(60));

  await example1_multipleAgents();
  await example2_parallelExecution();
  await example3_agentTeam();
  await example4_specializedTeam();
  await example5_agentCompetition();
  await example6_streamingMultiAgent();

  console.log("\n" + "=".repeat(60));
  console.log("✨ 所有示例完成！");
}

main().catch(console.error);
