/**
 * 多 Agent 并发测试
 * 测试两个 Agent 同时执行任务
 */

import { createAgent } from "./agent";

async function testConcurrent() {
  console.log("=".repeat(50));
  console.log("🧪 多 Agent 并发测试");
  console.log("=".repeat(50));

  // 创建两个 Agent
  const agent1 = createAgent();
  const agent2 = createAgent();

  const startTime = Date.now();

  console.log("\n⏱️  开始并发执行...\n");

  // 并发执行两个任务
  const results = await Promise.all([
    agent1.run("请用 Python 写一个快速排序算法，代码要简洁高效", {
      onMessage: (msg) => {
        // 只打印关键内容
        if (msg.includes("def") || msg.includes("def quick_sort")) {
          console.log("[Agent1] 生成代码中...");
        }
      },
    }),
    agent2.run("请解释什么是递归，并给出一个简单的例子", {
      onMessage: (msg) => {
        if (msg.includes("递归") || msg.includes("例子")) {
          console.log("[Agent2] 解释中...");
        }
      },
    }),
  ]);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n" + "=".repeat(50));
  console.log("✅ 并发执行完成！");
  console.log(`⏱️  总耗时: ${duration} 秒`);
  console.log("=".repeat(50));

  console.log("\n📋 Agent1 结果 (快速排序):");
  console.log("-".repeat(50));
  console.log(results[0]);

  console.log("\n📋 Agent2 结果 (递归解释):");
  console.log("-".repeat(50));
  console.log(results[1]);
}

// 对比：串行执行
async function testSequential() {
  console.log("\n\n" + "=".repeat(50));
  console.log("🧪 单 Agent 串行测试 (对比)");
  console.log("=".repeat(50));

  const agent = createAgent();
  const startTime = Date.now();

  console.log("\n⏱️  开始串行执行...\n");

  // 串行执行
  const result1 = await agent.run(
    "请用 Python 写一个快速排序算法，代码要简洁高效",
    {
      onMessage: () => {},
    }
  );
  console.log("✅ 任务1完成");

  const result2 = await agent.run("请解释什么是递归，并给出一个简单的例子", {
    onMessage: () => {},
  });
  console.log("✅ 任务2完成");

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n" + "=".repeat(50));
  console.log(`⏱️  串行总耗时: ${duration} 秒`);
  console.log("=".repeat(50));
}

async function testStreaming() {
  console.log("\n\n" + "=".repeat(50));
  console.log("🧪 多 Agent 流式并发测试");
  console.log("=".repeat(50));

  const agent1 = createAgent();
  const agent2 = createAgent();

  console.log("\n⏱️  启动两个流式 Agent...\n");

  // 启动两个流式生成器
  const stream1 = agent1.stream("计算 1+2+3+...+100 的结果");
  const stream2 = agent2.stream("讲一个关于编程的小笑话");

  // 交替输出
  let count1 = 0,
    count2 = 0;
  let done1 = false,
    done2 = false;

  while (!done1 || !done2) {
    if (!done1) {
      const { value, done } = await stream1.next();
      if (done) {
        done1 = true;
        console.log("\n[Agent1] ✅ 完成");
      } else if (value.type === "text") {
        process.stdout.write(`\r[Agent1] ${value.data.slice(0, 60)}...   `);
        count1++;
      }
    }

    if (!done2) {
      const { value, done } = await stream2.next();
      if (done) {
        done2 = true;
        console.log("\n[Agent2] ✅ 完成");
      } else if (value.type === "text") {
        process.stdout.write(`\r[Agent2] ${value.data.slice(0, 60)}...   `);
        count2++;
      }
    }
  }

  console.log("\n\n" + "=".repeat(50));
  console.log("[Agent1] 输出块数:", count1);
  console.log("[Agent2] 输出块数:", count2);
  console.log("=".repeat(50));
}

async function main() {
  try {
    // 测试1: 并发执行
    await testConcurrent();

    // 测试2: 串行执行对比
    await testSequential();

    // 测试3: 流式并发
    await testStreaming();
  } catch (error) {
    console.error("❌ 测试失败:", error);
  }
}

main();
