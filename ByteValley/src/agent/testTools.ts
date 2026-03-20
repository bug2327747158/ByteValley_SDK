/**
 * 新功能测试用例
 *
 * 测试方法：
 * 1. 在游戏输入框中输入测试提示词
 * 2. 或在 Electron 开发者工具控制台中调用测试函数
 */

import { executeSDKTask } from './gameIntegration';

// ==================== 工作目录配置 ====================

/**
 * 获取默认工作目录（适配 Windows Electron 环境）
 */
function getDefaultWorkingDir(): string {
  // 从 localStorage 读取保存的目录
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('bytevalley-working-dir');
    if (saved) return saved;
  }

  // Windows 默认路径
  return 'D:\\work_data\\claude_workspace\\ByteValley\\ByteValley';
}

// ==================== 测试提示词 ====================

/**
 * 在游戏中使用的测试提示词
 */
export const TEST_PROMPTS = {
  // 1. Glob 工具测试
  globFiles: `请使用 glob_files 工具查找所有 .tsx 文件，并列出找到的文件。`,

  globFilesPattern: `请使用 glob_files 工具查找 src/**/*.ts 下的所有 TypeScript 文件。`,

  globFilesSrc: `请使用 glob_files 工具查找 src/agent/ 目录下所有 .ts 文件。`,

  // 2. AskUserQuestion 工具测试
  askQuestionWithOptions: `我想创建一个新文件，请先问我应该使用什么文件名。提供以下选项：index.ts, app.ts, main.ts`,

  askQuestionFreeText: `请问我项目的主要功能是什么，然后根据我的回答生成相应的项目描述。`,

  askQuestionFileName: `我需要写入一个配置文件，请问我文件名应该是什么？选项：config.json, settings.json, .env`,

  // 3. 规划模式测试
  createSimplePlan: `请使用 create_plan 工具为"实现用户登录功能"制定一个执行计划，最多 3 个步骤。`,

  createComplexPlan: `请使用 create_plan 工具为"搭建一个完整的博客系统"制定一个详细的执行计划。`,

  // 4. 并行执行测试
  parallelExecution: `请使用 execute_parallel 工具同时检查以下三个文件的语法：src/App.tsx, src/agent/tools.ts, src/agent/AgentBridge.ts`,

  parallelReadFiles: `请使用 execute_parallel 工具同时读取 package.json, tsconfig.json, vite.config.ts 这三个文件的内容`,

  // 5. 组合测试
  combinedTest: `我想重构代码，请：
1. 先用 glob_files 找出所有 .ts 文件
2. 问我是否要继续
3. 如果确认，用 execute_parallel 同时检查这些文件的语法`,
};

// ==================== 直接测试函数 ====================

/**
 * 测试 Glob 工具
 */
export async function testGlobTool(agentId: string): Promise<string> {
  console.log('[Test] Testing glob_files tool...');

  return executeSDKTask(
    agentId,
    'Test Glob Files',
    TEST_PROMPTS.globFiles,
    getDefaultWorkingDir()
  );
}

/**
 * 测试用户提问（选项）
 */
export async function testAskQuestionOptions(agentId: string): Promise<string> {
  console.log('[Test] Testing ask_user_question with options...');

  return executeSDKTask(
    agentId,
    'Test Ask Question (Options)',
    TEST_PROMPTS.askQuestionWithOptions,
    getDefaultWorkingDir()
  );
}

/**
 * 测试用户提问（自由文本）
 */
export async function testAskQuestionFreeText(agentId: string): Promise<string> {
  console.log('[Test] Testing ask_user_question with free text...');

  return executeSDKTask(
    agentId,
    'Test Ask Question (Free Text)',
    TEST_PROMPTS.askQuestionFreeText,
    getDefaultWorkingDir()
  );
}

/**
 * 测试规划模式
 */
export async function testCreatePlan(agentId: string): Promise<string> {
  console.log('[Test] Testing create_plan tool...');

  return executeSDKTask(
    agentId,
    'Test Create Plan',
    TEST_PROMPTS.createSimplePlan,
    getDefaultWorkingDir()
  );
}

/**
 * 测试并行执行
 */
export async function testParallelExecution(agentId: string): Promise<string> {
  console.log('[Test] Testing execute_parallel tool...');

  return executeSDKTask(
    agentId,
    'Test Parallel Execution',
    TEST_PROMPTS.parallelExecution,
    getDefaultWorkingDir()
  );
}

/**
 * 运行所有测试
 */
export async function runAllTests(agentId: string): Promise<void> {
  console.log('[Test] ===== Starting All Tests =====');
  console.log('[Test] Working Directory:', getDefaultWorkingDir());

  const tests = [
    { name: 'Glob Files', fn: () => testGlobTool(agentId) },
    { name: 'Ask Question (Options)', fn: () => testAskQuestionOptions(agentId) },
    { name: 'Ask Question (Free Text)', fn: () => testAskQuestionFreeText(agentId) },
    { name: 'Create Plan', fn: () => testCreatePlan(agentId) },
    { name: 'Parallel Execution', fn: () => testParallelExecution(agentId) },
  ];

  for (const test of tests) {
    try {
      console.log(`[Test] Running: ${test.name}`);
      await test.fn();
      console.log(`[Test] ✓ ${test.name} completed`);
      // 等待一下再执行下一个测试
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`[Test] ✗ ${test.name} failed:`, error);
    }
  }

  console.log('[Test] ===== All Tests Complete =====');
}

// ==================== 在 Electron 渲染进程中使用 ====================

/**
 * 将测试函数暴露到 window 对象，方便在 Electron 开发者工具中调用
 */
export function exposeTestFunctions(agents: any[]): void {
  if (typeof window === 'undefined') return;

  const workingDir = getDefaultWorkingDir();

  (window as any).testTools = {
    // 显示当前工作目录
    workingDir: workingDir,

    // 获取第一个可用 agent
    getAgent: () => agents[0]?.id,
    getAllAgents: () => agents.map(a => a.id),

    // 设置工作目录
    setWorkingDir: (dir: string) => {
      localStorage.setItem('bytevalley-working-dir', dir);
      console.log('[Test] Working directory set to:', dir);
      (window as any).testTools.workingDir = dir;
    },

    // 测试函数
    testGlob: () => {
      const agentId = agents[0]?.id;
      if (agentId) return testGlobTool(agentId);
      console.error('[Test] No agent available');
    },

    testQuestion: () => {
      const agentId = agents[0]?.id;
      if (agentId) return testAskQuestionOptions(agentId);
      console.error('[Test] No agent available');
    },

    testQuestionText: () => {
      const agentId = agents[0]?.id;
      if (agentId) return testAskQuestionFreeText(agentId);
      console.error('[Test] No agent available');
    },

    testPlan: () => {
      const agentId = agents[0]?.id;
      if (agentId) return testCreatePlan(agentId);
      console.error('[Test] No agent available');
    },

    testParallel: () => {
      const agentId = agents[0]?.id;
      if (agentId) return testParallelExecution(agentId);
      console.error('[Test] No agent available');
    },

    runAll: () => {
      const agentId = agents[0]?.id;
      if (agentId) return runAllTests(agentId);
      console.error('[Test] No agent available');
    },

    // 测试提示词
    prompts: TEST_PROMPTS,
  };

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  🧪 ByteValley Test Tools Available                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('📁 Working Directory:', workingDir);
  console.log('');
  console.log('📋 Available Commands:');
  console.log('   window.testTools.testGlob()       - 测试 Glob 文件搜索');
  console.log('   window.testTools.testQuestion()   - 测试用户提问(选项)');
  console.log('   window.testTools.testQuestionText() - 测试用户提问(文本)');
  console.log('   window.testTools.testPlan()       - 测试规划模式');
  console.log('   window.testTools.testParallel()   - 测试并行执行');
  console.log('   window.testTools.runAll()         - 运行所有测试');
  console.log('');
  console.log('⚙️  Configuration:');
  console.log('   window.testTools.setWorkingDir("D:\\\\path\\\\to\\\\project")');
  console.log('   window.testTools.prompts          - 查看所有测试提示词');
  console.log('');
}
