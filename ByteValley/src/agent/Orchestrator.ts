/**
 * Orchestrator - 主 Agent 协调器
 *
 * 负责协调主 Agent 与子 Agent (Planner, Executor, Tester, Reviewer) 之间的协作
 * 实现多 Agent 任务编排、DAG 调度和结果聚合
 */

import type { Agent } from './gameIntegration';
import type { AgentTask, OrchestratorResult, OrchestratorSubTask } from './types';
import { getAgentBridge } from './AgentBridge';
import { createSubAgent, cleanupSubAgents } from './SubAgentFactory';

type ExecutableAgentType = 'executor' | 'tester' | 'reviewer';

interface PlannedStep {
  id: string;
  agentType: ExecutableAgentType;
  description: string;
  dependencies: string[];
}

interface DagExecutionResult {
  subTasks: OrchestratorSubTask[];
  stepResults: Map<string, string>;
  executedSteps: number;
}

interface QualityEvaluation {
  passed: boolean;
  testPassed: boolean;
  reviewPassed: boolean;
  reason: string;
}

function toSubAgentVisualPayload(agent: Agent) {
  return {
    id: agent.id,
    x: agent.x,
    y: agent.y,
    agentType: agent.agentType || 'executor',
    parentAgentId: agent.parentAgentId,
    isTemporary: agent.isTemporary === true,
    color: agent.color,
    message: agent.message,
  };
}

function mapToolToState(toolName: string): 'READING' | 'WRITING' | 'EXECUTING' | 'AWAITING_APPROVAL' | 'PLANNING' | 'THINKING' {
  if (toolName === 'read_file' || toolName === 'search_files' || toolName === 'list_files' || toolName === 'glob_files') {
    return 'READING';
  }
  if (toolName === 'write_file' || toolName === 'edit_file' || toolName === 'apply_patch') {
    return 'WRITING';
  }
  if (toolName === 'run_command') {
    return 'EXECUTING';
  }
  if (toolName === 'ask_user_question') {
    return 'AWAITING_APPROVAL';
  }
  if (toolName === 'create_plan') {
    return 'PLANNING';
  }
  return 'THINKING';
}

/**
 * Orchestrator 配置
 */
export interface OrchestratorConfig {
  maxRetries?: number;           // 最大修复重试次数（默认 3）
  maxSteps?: number;             // 最大执行步骤数（默认 10）
  enablePlanner?: boolean;       // 是否启用 Planner（默认 true）
  enableExecutor?: boolean;      // 是否启用 Executor（默认 true）
  enableTester?: boolean;        // 是否启用 Tester（默认 true）
  enableReviewer?: boolean;      // 是否启用 Reviewer（默认 true）
  allowParallel?: boolean;       // DAG 就绪步骤是否并行执行（默认 true）
  onProgress?: (step: string, data: any) => void;  // 进度回调
}

/**
 * 运行 Orchestrator 任务
 *
 * @param primaryAgent 主 Agent
 * @param task 要执行的任务
 * @param config 配置选项
 * @returns 执行结果
 */
export async function orchestrateTask(
  primaryAgent: Agent,
  task: AgentTask,
  config: OrchestratorConfig = {}
): Promise<OrchestratorResult> {
  const finalConfig: Required<OrchestratorConfig> = {
    maxRetries: 3,
    maxSteps: 10,
    enablePlanner: true,
    enableExecutor: true,
    enableTester: true,
    enableReviewer: true,
    allowParallel: true,
    onProgress: () => {},
    ...config,
  };

  const result: OrchestratorResult = {
    success: false,
    retriesUsed: 0,
  };

  const createdSubAgentIds: string[] = [];
  let executedSteps = 0;

  try {
    finalConfig.onProgress('starting', {
      primaryAgent: primaryAgent.id,
      task: task.title,
      config: finalConfig,
    });

    // 1) Planner 产出 DAG 计划（或使用 fallback）
    let planText = '';
    if (finalConfig.enablePlanner) {
      finalConfig.onProgress('creating_planner', { task: task.title });
      const planner = await createSubAgent({
        parentAgent: primaryAgent,
        agentType: 'planner',
        taskContext: task.title,
      });
      createdSubAgentIds.push(planner.id);
      finalConfig.onProgress('planner_created', {
        agentId: planner.id,
        parentAgentId: primaryAgent.id,
        subAgent: toSubAgentVisualPayload(planner),
      });

      finalConfig.onProgress('subagent_state', {
        agentId: planner.id,
        parentAgentId: primaryAgent.id,
        state: 'PLANNING',
        message: 'Planning DAG steps...',
      });
      finalConfig.onProgress('running_planner', { agentId: planner.id });
      planText = await runPlanner(planner, task, finalConfig);
      finalConfig.onProgress('subagent_state', {
        agentId: planner.id,
        parentAgentId: primaryAgent.id,
        state: 'DONE',
        message: 'Planner completed',
      });
      finalConfig.onProgress('planner_completed', { result: planText });
    }

    const plannedSteps = parsePlannerOutput(planText, task, finalConfig);
    result.plan = planText || buildFallbackPlan(plannedSteps);
    finalConfig.onProgress('plan_parsed', {
      stepCount: plannedSteps.length,
      steps: plannedSteps,
    });

    // 2) 按 DAG 调度执行（支持并行批次）
    const dagResult = await executePlanDAG(
      primaryAgent,
      task,
      result.plan,
      plannedSteps,
      finalConfig,
      createdSubAgentIds
    );
    executedSteps += dagResult.executedSteps;
    result.subTasks = dagResult.subTasks;

    result.execution = collectResultsByType('executor', plannedSteps, dagResult.stepResults);
    result.test = collectResultsByType('tester', plannedSteps, dagResult.stepResults);
    result.review = collectResultsByType('reviewer', plannedSteps, dagResult.stepResults);

    // 3) 评估结果，不通过则进入修复循环（最多 maxRetries）
    let quality = evaluateQuality(result, finalConfig);
    while (!quality.passed && result.retriesUsed < finalConfig.maxRetries) {
      if (executedSteps >= finalConfig.maxSteps) {
        throw new Error(`Orchestrator exceeded max steps (${finalConfig.maxSteps})`);
      }

      result.retriesUsed += 1;
      finalConfig.onProgress('retry_started', {
        retry: result.retriesUsed,
        maxRetries: finalConfig.maxRetries,
        reason: quality.reason,
      });

      // fix by executor
      finalConfig.onProgress('creating_executor', { retry: result.retriesUsed });
      const fixer = await createSubAgent({
        parentAgent: primaryAgent,
        agentType: 'executor',
        taskContext: `${task.title} (retry ${result.retriesUsed})`,
      });
      createdSubAgentIds.push(fixer.id);
      finalConfig.onProgress('executor_created', {
        agentId: fixer.id,
        retry: result.retriesUsed,
        parentAgentId: primaryAgent.id,
        subAgent: toSubAgentVisualPayload(fixer),
      });

      finalConfig.onProgress('running_executor', { retry: result.retriesUsed, agentId: fixer.id });
      finalConfig.onProgress('subagent_state', {
        agentId: fixer.id,
        parentAgentId: primaryAgent.id,
        state: 'EXECUTING',
        message: `Fix cycle #${result.retriesUsed} running`,
      });
      const fixExecution = await runExecutor(
        fixer,
        task,
        buildFixPlan(task, result, quality, result.retriesUsed),
        (state, message, toolName) => {
          finalConfig.onProgress('subagent_state', {
            agentId: fixer.id,
            parentAgentId: primaryAgent.id,
            state,
            message,
            toolName,
          });
        }
      );
      finalConfig.onProgress('subagent_state', {
        agentId: fixer.id,
        parentAgentId: primaryAgent.id,
        state: 'DONE',
        message: `Fix cycle #${result.retriesUsed} completed`,
      });
      result.execution = appendSection(result.execution, `Retry ${result.retriesUsed}`, fixExecution);
      finalConfig.onProgress('executor_completed', { retry: result.retriesUsed, result: fixExecution });
      executedSteps += 1;

      // re-test
      if (finalConfig.enableTester) {
        finalConfig.onProgress('creating_tester', { retry: result.retriesUsed });
        const tester = await createSubAgent({
          parentAgent: primaryAgent,
          agentType: 'tester',
          taskContext: `${task.title} (retry test ${result.retriesUsed})`,
        });
        createdSubAgentIds.push(tester.id);
        finalConfig.onProgress('tester_created', {
          agentId: tester.id,
          retry: result.retriesUsed,
          parentAgentId: primaryAgent.id,
          subAgent: toSubAgentVisualPayload(tester),
        });

        finalConfig.onProgress('running_tester', { retry: result.retriesUsed, agentId: tester.id });
        finalConfig.onProgress('subagent_state', {
          agentId: tester.id,
          parentAgentId: primaryAgent.id,
          state: 'TESTING',
          message: `Retry test #${result.retriesUsed} running`,
        });
        const retestResult = await runTester(tester, task, result.execution || '');
        finalConfig.onProgress('subagent_state', {
          agentId: tester.id,
          parentAgentId: primaryAgent.id,
          state: 'DONE',
          message: `Retry test #${result.retriesUsed} completed`,
        });
        result.test = appendSection(result.test, `Retry ${result.retriesUsed}`, retestResult);
        finalConfig.onProgress('tester_completed', { retry: result.retriesUsed, result: retestResult });
        executedSteps += 1;
      }

      // re-review
      if (finalConfig.enableReviewer) {
        finalConfig.onProgress('creating_reviewer', { retry: result.retriesUsed });
        const reviewer = await createSubAgent({
          parentAgent: primaryAgent,
          agentType: 'reviewer',
          taskContext: `${task.title} (retry review ${result.retriesUsed})`,
        });
        createdSubAgentIds.push(reviewer.id);
        finalConfig.onProgress('reviewer_created', {
          agentId: reviewer.id,
          retry: result.retriesUsed,
          parentAgentId: primaryAgent.id,
          subAgent: toSubAgentVisualPayload(reviewer),
        });

        finalConfig.onProgress('running_reviewer', { retry: result.retriesUsed, agentId: reviewer.id });
        finalConfig.onProgress('subagent_state', {
          agentId: reviewer.id,
          parentAgentId: primaryAgent.id,
          state: 'REVIEWING',
          message: `Retry review #${result.retriesUsed} running`,
        });
        const rereviewResult = await runReviewer(reviewer, {
          task,
          plan: result.plan || '',
          execution: result.execution || '',
          test: result.test || '',
        });
        finalConfig.onProgress('subagent_state', {
          agentId: reviewer.id,
          parentAgentId: primaryAgent.id,
          state: 'DONE',
          message: `Retry review #${result.retriesUsed} completed`,
        });
        result.review = appendSection(result.review, `Retry ${result.retriesUsed}`, rereviewResult);
        finalConfig.onProgress('reviewer_completed', { retry: result.retriesUsed, result: rereviewResult });
        executedSteps += 1;
      }

      quality = evaluateQuality(result, finalConfig);
    }

    result.success = quality.passed;
    result.finalResult = generateFinalResult(result, quality);

    finalConfig.onProgress('completed', {
      success: result.success,
      retriesUsed: result.retriesUsed,
      quality,
      result,
    });
  } catch (error: any) {
    result.success = false;
    result.finalResult = `Task orchestration failed: ${error.message}`;
    finalConfig.onProgress('error', { error: error.message });
  } finally {
    finalConfig.onProgress('cleanup', {
      subAgentCount: createdSubAgentIds.length,
      subAgentIds: [...createdSubAgentIds],
      parentAgentId: primaryAgent.id,
    });
    cleanupSubAgents(createdSubAgentIds);
    finalConfig.onProgress('cleanup_done', {});
  }

  return result;
}

/**
 * 运行 Planner 子 Agent，要求输出结构化 DAG
 */
async function runPlanner(
  planner: Agent,
  task: AgentTask,
  config: Required<OrchestratorConfig>
): Promise<string> {
  const bridge = getAgentBridge();
  const agentData = bridge.getAllAgents().get(planner.id);

  if (!agentData?.sdkAgent) {
    throw new Error(`Planner SDK agent not found: ${planner.id}`);
  }

  const enabledRoles = [
    config.enableExecutor ? 'executor' : null,
    config.enableTester ? 'tester' : null,
    config.enableReviewer ? 'reviewer' : null,
  ].filter(Boolean).join(', ');

  const prompt = `You are a planner. Convert the task into a DAG.

Task title: ${task.title}
Task description: ${task.description}

Return STRICT JSON only in this format:
{
  "steps": [
    {
      "id": "executor_1",
      "agentType": "executor",
      "description": "implement ...",
      "dependencies": []
    },
    {
      "id": "tester_1",
      "agentType": "tester",
      "description": "validate ...",
      "dependencies": ["executor_1"]
    },
    {
      "id": "reviewer_1",
      "agentType": "reviewer",
      "description": "review ...",
      "dependencies": ["tester_1"]
    }
  ]
}

Rules:
- agentType must be one of: ${enabledRoles}
- Keep dependencies acyclic
- Use concise actionable descriptions
- Include tester/reviewer steps when enabled
- No markdown, no explanation, JSON only.`;

  return agentData.sdkAgent.query(prompt, { maxTokens: 4096 });
}

/**
 * 执行 DAG
 */
async function executePlanDAG(
  primaryAgent: Agent,
  task: AgentTask,
  planText: string,
  plannedSteps: PlannedStep[],
  config: Required<OrchestratorConfig>,
  createdSubAgentIds: string[]
): Promise<DagExecutionResult> {
  const subTaskMap = new Map<string, OrchestratorSubTask>();
  const stepResults = new Map<string, string>();
  const completed = new Set<string>();
  let executedSteps = 0;

  plannedSteps.forEach((step) => {
    subTaskMap.set(step.id, {
      id: step.id,
      agentType: step.agentType,
      description: step.description,
      dependencies: [...step.dependencies],
      status: 'TODO',
    });
  });

  while (completed.size < plannedSteps.length) {
    const readySteps = plannedSteps.filter((step) => {
      if (completed.has(step.id)) return false;
      return step.dependencies.every((dep) => completed.has(dep));
    });

    if (readySteps.length === 0) {
      const blocked = plannedSteps
        .filter((s) => !completed.has(s.id))
        .map((s) => `${s.id} <- [${s.dependencies.join(', ')}]`)
        .join('; ');
      throw new Error(`DAG blocked by unresolved dependencies: ${blocked}`);
    }

    const batch = config.allowParallel ? readySteps : [readySteps[0]];
    config.onProgress('running_batch', {
      size: batch.length,
      steps: batch.map((s) => ({ id: s.id, agentType: s.agentType })),
    });

    const batchResults = await Promise.all(batch.map(async (step) => {
      const subTask = subTaskMap.get(step.id)!;
      subTask.status = 'IN_PROGRESS';

      if (executedSteps >= config.maxSteps) {
        throw new Error(`Orchestrator exceeded max steps (${config.maxSteps})`);
      }
      executedSteps += 1;

      try {
        config.onProgress('running_subtask', {
          stepId: step.id,
          agentType: step.agentType,
          description: step.description,
        });

        const output = await executeSingleStep(
          primaryAgent,
          task,
          planText,
          step,
          plannedSteps,
          stepResults,
          createdSubAgentIds,
          config
        );

        subTask.status = 'COMPLETED';
        subTask.result = output;

        config.onProgress('subtask_completed', {
          stepId: step.id,
          agentType: step.agentType,
          result: output,
        });

        return { stepId: step.id, output };
      } catch (error: any) {
        subTask.status = 'FAILED';
        subTask.error = error.message;
        config.onProgress('subtask_failed', {
          stepId: step.id,
          agentType: step.agentType,
          error: error.message,
        });
        throw error;
      }
    }));

    batchResults.forEach(({ stepId, output }) => {
      completed.add(stepId);
      stepResults.set(stepId, output);
    });
  }

  return {
    subTasks: Array.from(subTaskMap.values()),
    stepResults,
    executedSteps,
  };
}

/**
 * 执行单个子任务
 */
async function executeSingleStep(
  primaryAgent: Agent,
  task: AgentTask,
  planText: string,
  step: PlannedStep,
  allSteps: PlannedStep[],
  stepResults: Map<string, string>,
  createdSubAgentIds: string[],
  config: Required<OrchestratorConfig>
): Promise<string> {
  config.onProgress(`creating_${step.agentType}`, { stepId: step.id, description: step.description });
  const subAgent = await createSubAgent({
    parentAgent: primaryAgent,
    agentType: step.agentType,
    taskContext: `${task.title}: ${step.description}`,
  });
  createdSubAgentIds.push(subAgent.id);
  config.onProgress(`${step.agentType}_created`, {
    agentId: subAgent.id,
    stepId: step.id,
    parentAgentId: primaryAgent.id,
    subAgent: toSubAgentVisualPayload(subAgent),
  });

  const dependencySummary = step.dependencies
    .map((depId) => `Dependency ${depId}:\n${stepResults.get(depId) || '(no output)'}`)
    .join('\n\n');

  try {
    if (step.agentType === 'executor') {
      config.onProgress('running_executor', { stepId: step.id, agentId: subAgent.id });
      config.onProgress('subagent_state', {
        agentId: subAgent.id,
        parentAgentId: primaryAgent.id,
        state: 'EXECUTING',
        message: `Executing step ${step.id}`,
      });
      const output = await runExecutor(
        subAgent,
        task,
        `Plan context:\n${planText}\n\nCurrent executor step (${step.id}): ${step.description}\n\n${dependencySummary}`,
        (state, message, toolName) => {
          config.onProgress('subagent_state', {
            agentId: subAgent.id,
            parentAgentId: primaryAgent.id,
            state,
            message,
            toolName,
          });
        }
      );
      config.onProgress('subagent_state', {
        agentId: subAgent.id,
        parentAgentId: primaryAgent.id,
        state: 'DONE',
        message: `Step ${step.id} complete`,
      });
      config.onProgress('executor_completed', { stepId: step.id, result: output });
      return output;
    }

    if (step.agentType === 'tester') {
      config.onProgress('running_tester', { stepId: step.id, agentId: subAgent.id });
      config.onProgress('subagent_state', {
        agentId: subAgent.id,
        parentAgentId: primaryAgent.id,
        state: 'TESTING',
        message: `Testing step ${step.id}`,
      });
      const executorOutputs = collectResultsByType('executor', allSteps, stepResults) || dependencySummary;
      const output = await runTester(subAgent, task, executorOutputs);
      config.onProgress('subagent_state', {
        agentId: subAgent.id,
        parentAgentId: primaryAgent.id,
        state: 'DONE',
        message: `Step ${step.id} test complete`,
      });
      config.onProgress('tester_completed', { stepId: step.id, result: output });
      return output;
    }

    config.onProgress('running_reviewer', { stepId: step.id, agentId: subAgent.id });
    config.onProgress('subagent_state', {
      agentId: subAgent.id,
      parentAgentId: primaryAgent.id,
      state: 'REVIEWING',
      message: `Reviewing step ${step.id}`,
    });
    const execution = collectResultsByType('executor', allSteps, stepResults) || dependencySummary;
    const test = collectResultsByType('tester', allSteps, stepResults) || dependencySummary;
    const output = await runReviewer(subAgent, {
      task,
      plan: planText,
      execution,
      test,
    });
    config.onProgress('subagent_state', {
      agentId: subAgent.id,
      parentAgentId: primaryAgent.id,
      state: 'DONE',
      message: `Step ${step.id} review complete`,
    });
    config.onProgress('reviewer_completed', { stepId: step.id, result: output });
    return output;
  } catch (error: any) {
    config.onProgress('subagent_state', {
      agentId: subAgent.id,
      parentAgentId: primaryAgent.id,
      state: 'ERROR',
      message: `Step ${step.id} failed: ${error?.message || 'unknown error'}`,
    });
    throw error;
  }
}

/**
 * 运行 Executor 子 Agent
 */
async function runExecutor(
  executor: Agent,
  task: AgentTask,
  plan: string,
  onSubAgentState?: (
    state: 'THINKING' | 'READING' | 'WRITING' | 'EXECUTING' | 'AWAITING_APPROVAL' | 'PLANNING' | 'ERROR',
    message: string,
    toolName?: string
  ) => void
): Promise<string> {
  const bridge = getAgentBridge();
  const agentData = bridge.getAllAgents().get(executor.id);

  if (!agentData?.sdkAgent) {
    throw new Error(`Executor SDK agent not found: ${executor.id}`);
  }

  const prompt = `Implement the task based on this plan:\n\n${plan}\n\nTask: ${task.title}\nDescription: ${task.description}\n\nHard constraints:
1. For existing files, use apply_patch (preferred) or edit_file. Do NOT overwrite full file content.
2. write_file is allowed only when creating a brand-new file.
3. If a command/test fails, fix and continue.
4. Do NOT keep retrying the same failing command endlessly. Maximum 2 retries per command pattern.
5. If failure indicates missing runtime/dependency (e.g. python/pytest not installed), stop retrying aliases and report it in issues.
6. Return structured JSON with this schema:
{
  "status": "success|fail",
  "actions": [{"type": "patch|edit|create|command", "target": "path or command", "summary": "..."}],
  "tests": {"command": "...", "result": "passed|failed|not_run"},
  "issues": ["..."]
}`;

  onSubAgentState?.('THINKING', 'Preparing execution...');

  return agentData.sdkAgent.run(prompt, {
    maxTokens: 8192,
    workingDirectory: task.workingDirectory,
    onToolUse: (name: string) => {
      const state = mapToolToState(name);
      onSubAgentState?.(state, `Using tool: ${name}`, name);
    },
    onToolResult: (name: string, result: any) => {
      if (!result?.success) {
        onSubAgentState?.('ERROR', `Tool failed: ${name}`, name);
      } else {
        onSubAgentState?.('THINKING', `Tool done: ${name}`, name);
      }
    },
  });
}

/**
 * 运行 Tester 子 Agent
 */
async function runTester(
  tester: Agent,
  task: AgentTask,
  executionResult: string
): Promise<string> {
  const bridge = getAgentBridge();
  const agentData = bridge.getAllAgents().get(tester.id);

  if (!agentData?.sdkAgent) {
    throw new Error(`Tester SDK agent not found: ${tester.id}`);
  }

  const prompt = `Validate the implementation below.\n\nTask: ${task.title}\nDescription: ${task.description}\n\nImplementation output:\n${executionResult}\n\nRules:
1. Run relevant checks/tests when possible.
2. Do NOT modify implementation code.
3. Return STRICT JSON:
{
  "status": "pass|fail",
  "summary": "...",
  "command": "test command or not_run",
  "issues": ["..."]
}`;

  return agentData.sdkAgent.query(prompt, { maxTokens: 4096 });
}

/**
 * 运行 Reviewer 子 Agent
 */
async function runReviewer(
  reviewer: Agent,
  context: {
    task: AgentTask;
    plan: string;
    execution: string;
    test: string;
  }
): Promise<string> {
  const bridge = getAgentBridge();
  const agentData = bridge.getAllAgents().get(reviewer.id);

  if (!agentData?.sdkAgent) {
    throw new Error(`Reviewer SDK agent not found: ${reviewer.id}`);
  }

  const prompt = `Review the following work:\n\nTask: ${context.task.title}\nDescription: ${context.task.description}\n\nPlan:\n${context.plan}\n\nImplementation:\n${context.execution}\n\nTest results:\n${context.test}\n\nReturn STRICT JSON:
{
  "status": "approved|rejected",
  "reason": "...",
  "risks": ["..."]
}`;

  return agentData.sdkAgent.query(prompt, { maxTokens: 4096 });
}

function parsePlannerOutput(
  planText: string,
  task: AgentTask,
  config: Required<OrchestratorConfig>
): PlannedStep[] {
  if (!planText.trim()) {
    return buildFallbackSteps(task, config);
  }

  const payload = extractJsonPayload(planText);
  if (!payload) {
    return buildFallbackSteps(task, config);
  }

  try {
    const parsed = JSON.parse(payload);
    const rawSteps: any[] = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed?.steps) ? parsed.steps : []);

    if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
      return buildFallbackSteps(task, config);
    }

    const provisionalIds = rawSteps.map((raw, index) => sanitizeStepId(raw?.id, index));
    const idSet = new Set(provisionalIds);

    const steps: PlannedStep[] = rawSteps
      .map((raw, index) => {
        const agentType = normalizeAgentType(raw?.agentType || raw?.role || raw?.type);
        if (!agentType) return null;
        if (agentType === 'executor' && !config.enableExecutor) return null;
        if (agentType === 'tester' && !config.enableTester) return null;
        if (agentType === 'reviewer' && !config.enableReviewer) return null;

        const id = provisionalIds[index];
        const description = String(raw?.description || raw?.title || `Step ${index + 1}`).trim();
        const dependencies = normalizeDependencies(raw?.dependencies, provisionalIds, idSet, id);

        return { id, agentType, description, dependencies };
      })
      .filter((step): step is PlannedStep => step !== null);

    if (steps.length === 0) {
      return buildFallbackSteps(task, config);
    }

    if (!validateAcyclic(steps)) {
      return buildFallbackSteps(task, config);
    }

    return ensureRequiredRoleSteps(steps, task, config);
  } catch {
    return buildFallbackSteps(task, config);
  }
}

function ensureRequiredRoleSteps(
  steps: PlannedStep[],
  task: AgentTask,
  config: Required<OrchestratorConfig>
): PlannedStep[] {
  const finalSteps = [...steps];

  const hasExecutor = finalSteps.some((s) => s.agentType === 'executor');
  const hasTester = finalSteps.some((s) => s.agentType === 'tester');
  const hasReviewer = finalSteps.some((s) => s.agentType === 'reviewer');

  if (config.enableExecutor && !hasExecutor) {
    finalSteps.push({
      id: sanitizeStepId('executor_auto', finalSteps.length),
      agentType: 'executor',
      description: `Implement task: ${task.title}`,
      dependencies: [],
    });
  }

  if (config.enableTester && !hasTester) {
    const lastExecutor = [...finalSteps].reverse().find((s) => s.agentType === 'executor');
    finalSteps.push({
      id: sanitizeStepId('tester_auto', finalSteps.length),
      agentType: 'tester',
      description: `Validate task: ${task.title}`,
      dependencies: lastExecutor ? [lastExecutor.id] : [],
    });
  }

  if (config.enableReviewer && !hasReviewer) {
    const lastTestOrExec = [...finalSteps].reverse().find((s) => s.agentType === 'tester')
      || [...finalSteps].reverse().find((s) => s.agentType === 'executor');
    finalSteps.push({
      id: sanitizeStepId('reviewer_auto', finalSteps.length),
      agentType: 'reviewer',
      description: `Review task result: ${task.title}`,
      dependencies: lastTestOrExec ? [lastTestOrExec.id] : [],
    });
  }

  return validateAcyclic(finalSteps) ? finalSteps : buildFallbackSteps(task, config);
}

function normalizeAgentType(raw: unknown): ExecutableAgentType | null {
  const value = String(raw || '').trim().toLowerCase();
  if (value.includes('executor')) return 'executor';
  if (value.includes('tester') || value.includes('test')) return 'tester';
  if (value.includes('reviewer') || value.includes('review')) return 'reviewer';
  return null;
}

function sanitizeStepId(rawId: unknown, index: number): string {
  const fallback = `step_${index + 1}`;
  const normalized = String(rawId || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || fallback;
}

function normalizeDependencies(
  rawDependencies: unknown,
  provisionalIds: string[],
  idSet: Set<string>,
  selfId: string
): string[] {
  if (!Array.isArray(rawDependencies)) return [];

  const deps = rawDependencies
    .map((dep) => {
      if (typeof dep === 'number' && provisionalIds[dep]) {
        return provisionalIds[dep];
      }
      const depId = sanitizeStepId(dep, -1);
      return idSet.has(depId) ? depId : null;
    })
    .filter((dep): dep is string => !!dep && dep !== selfId);

  return Array.from(new Set(deps));
}

function validateAcyclic(steps: PlannedStep[]): boolean {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (id: string): boolean => {
    if (visited.has(id)) return true;
    if (visiting.has(id)) return false;

    visiting.add(id);
    const step = byId.get(id);
    if (!step) {
      visiting.delete(id);
      visited.add(id);
      return true;
    }

    for (const dep of step.dependencies) {
      if (!dfs(dep)) return false;
    }

    visiting.delete(id);
    visited.add(id);
    return true;
  };

  return steps.every((step) => dfs(step.id));
}

function buildFallbackSteps(task: AgentTask, config: Required<OrchestratorConfig>): PlannedStep[] {
  const steps: PlannedStep[] = [];
  let previousId: string | null = null;

  if (config.enableExecutor) {
    const id = 'executor_1';
    steps.push({
      id,
      agentType: 'executor',
      description: `Implement task: ${task.title}`,
      dependencies: [],
    });
    previousId = id;
  }

  if (config.enableTester) {
    const id = 'tester_1';
    steps.push({
      id,
      agentType: 'tester',
      description: `Test implementation for: ${task.title}`,
      dependencies: previousId ? [previousId] : [],
    });
    previousId = id;
  }

  if (config.enableReviewer) {
    const id = 'reviewer_1';
    steps.push({
      id,
      agentType: 'reviewer',
      description: `Review final result for: ${task.title}`,
      dependencies: previousId ? [previousId] : [],
    });
  }

  if (steps.length === 0) {
    steps.push({
      id: 'executor_1',
      agentType: 'executor',
      description: `Implement task: ${task.title}`,
      dependencies: [],
    });
  }

  return steps;
}

function buildFallbackPlan(steps: PlannedStep[]): string {
  const lines = ['Fallback Orchestration Plan (DAG):'];
  steps.forEach((step, index) => {
    lines.push(
      `${index + 1}. [${step.agentType}] ${step.id}: ${step.description}` +
      (step.dependencies.length ? ` (depends on: ${step.dependencies.join(', ')})` : '')
    );
  });
  return lines.join('\n');
}

function collectResultsByType(
  agentType: ExecutableAgentType,
  steps: PlannedStep[],
  stepResults: Map<string, string>
): string {
  const matched = steps
    .filter((step) => step.agentType === agentType)
    .map((step) => {
      const output = stepResults.get(step.id) || '';
      return `[${step.id}]\n${output}`;
    })
    .filter((block) => block.trim() !== '');

  return matched.join('\n\n');
}

function buildFixPlan(
  task: AgentTask,
  result: OrchestratorResult,
  quality: QualityEvaluation,
  retryCount: number
): string {
  return `Fix cycle #${retryCount}

Task: ${task.title}
Description: ${task.description}

Latest plan:
${result.plan || '(none)'}

Latest execution:
${result.execution || '(none)'}

Latest test:
${result.test || '(none)'}

Latest review:
${result.review || '(none)'}

Fix target:
${quality.reason}

Make minimal patches to resolve failing points, then summarize what changed.`;
}

function evaluateQuality(
  result: OrchestratorResult,
  config: Required<OrchestratorConfig>
): QualityEvaluation {
  const testVerdict = parseTesterVerdict(result.test || '');
  const reviewVerdict = parseReviewerVerdict(result.review || '');

  const testPassed = !config.enableTester || testVerdict === 'pass';
  const reviewPassed = !config.enableReviewer || reviewVerdict === 'approved';

  const reasons: string[] = [];
  if (!testPassed) reasons.push('Tester reported fail/unknown');
  if (!reviewPassed) reasons.push('Reviewer did not approve');

  return {
    passed: testPassed && reviewPassed,
    testPassed,
    reviewPassed,
    reason: reasons.join('; ') || 'All checks passed',
  };
}

function parseTesterVerdict(text: string): 'pass' | 'fail' | 'unknown' {
  const payload = parseJsonObject<{ status?: string }>(text);
  const jsonStatus = String(payload?.status || '').toLowerCase();
  if (jsonStatus === 'pass' || jsonStatus === 'passed') return 'pass';
  if (jsonStatus === 'fail' || jsonStatus === 'failed') return 'fail';

  const lower = text.toLowerCase();
  if (!lower.trim()) return 'unknown';
  if (/(\bfail\b|\bfailed\b|\berror\b|\bnot pass\b|\bexception\b)/.test(lower)) return 'fail';
  if (/(\bpass\b|\bpassed\b|all tests passed|success)/.test(lower)) return 'pass';
  return 'unknown';
}

function parseReviewerVerdict(text: string): 'approved' | 'rejected' | 'unknown' {
  const payload = parseJsonObject<{ status?: string }>(text);
  const jsonStatus = String(payload?.status || '').toLowerCase();
  if (jsonStatus === 'approved' || jsonStatus === 'approve' || jsonStatus === 'pass') return 'approved';
  if (jsonStatus === 'rejected' || jsonStatus === 'reject' || jsonStatus === 'fail') return 'rejected';

  const lower = text.toLowerCase();
  if (!lower.trim()) return 'unknown';
  if (/(\brejected\b|\breject\b|\bnot approved\b|\bfail\b)/.test(lower)) return 'rejected';
  if (/(\bapproved\b|\bapprove\b|\bpass\b)/.test(lower)) return 'approved';
  return 'unknown';
}

function extractJsonPayload(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const objStart = text.indexOf('{');
  const arrStart = text.indexOf('[');

  if (objStart === -1 && arrStart === -1) {
    return null;
  }

  if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) {
    const arrEnd = text.lastIndexOf(']');
    if (arrEnd > arrStart) {
      return text.slice(arrStart, arrEnd + 1).trim();
    }
  }

  if (objStart !== -1) {
    const objEnd = text.lastIndexOf('}');
    if (objEnd > objStart) {
      return text.slice(objStart, objEnd + 1).trim();
    }
  }

  return null;
}

function parseJsonObject<T>(text: string): T | null {
  const payload = extractJsonPayload(text);
  if (!payload) return null;

  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

function appendSection(base: string | undefined, label: string, content: string): string {
  if (!base || !base.trim()) {
    return content;
  }

  return `${base}\n\n--- ${label} ---\n${content}`;
}

/**
 * 生成最终结果摘要
 */
function generateFinalResult(result: OrchestratorResult, quality: QualityEvaluation): string {
  const sections: string[] = [];

  sections.push('=== ORCHESTRATION RESULT ===');
  sections.push(`Success: ${result.success ? 'YES' : 'NO'}`);
  sections.push(`Retries used: ${result.retriesUsed}`);
  sections.push(`Tester verdict: ${quality.testPassed ? 'PASS' : 'FAIL'}`);
  sections.push(`Reviewer verdict: ${quality.reviewPassed ? 'APPROVED' : 'REJECTED'}`);
  sections.push('');

  if (result.plan) {
    sections.push('📋 PLAN:');
    sections.push(result.plan.slice(0, 800) + (result.plan.length > 800 ? '...' : ''));
    sections.push('');
  }

  if (result.execution) {
    sections.push('⚙️ EXECUTION:');
    sections.push(result.execution.slice(0, 800) + (result.execution.length > 800 ? '...' : ''));
    sections.push('');
  }

  if (result.test) {
    sections.push('🔍 TEST RESULT:');
    sections.push(result.test.slice(0, 800) + (result.test.length > 800 ? '...' : ''));
    sections.push('');
  }

  if (result.review) {
    sections.push('✓ REVIEW:');
    sections.push(result.review.slice(0, 800) + (result.review.length > 800 ? '...' : ''));
    sections.push('');
  }

  if (result.subTasks?.length) {
    sections.push('🧩 DAG STEPS:');
    result.subTasks.forEach((st) => {
      const deps = st.dependencies?.length ? ` deps=[${st.dependencies.join(', ')}]` : '';
      sections.push(`- ${st.id} [${st.agentType}] ${st.status}${deps}`);
    });
    sections.push('');
  }

  sections.push(result.success ? '✅ SUCCESS' : `❌ FAILED: ${quality.reason}`);

  return sections.join('\n');
}

/**
 * 创建简化的 Orchestrator（仅用于简单任务）
 *
 * 对于简单任务，直接使用主 Agent 执行，不创建子 Agent
 */
export async function simpleOrchestrate(
  primaryAgent: Agent,
  task: AgentTask,
  onProgress?: (step: string, data: any) => void
): Promise<string> {
  const bridge = getAgentBridge();
  const agentData = bridge.getAllAgents().get(primaryAgent.id);

  if (!agentData?.sdkAgent) {
    throw new Error(`Primary SDK agent not found: ${primaryAgent.id}`);
  }

  onProgress?.('starting', { task: task.title });

  const prompt = `Task: ${task.title}\n\nDescription: ${task.description}\n\nPlease complete this task using available tools. Prefer apply_patch for existing files and avoid full file overwrite.`;

  try {
    const response = await agentData.sdkAgent.run(prompt, {
      maxTokens: 8192,
      workingDirectory: task.workingDirectory,
      onLoopStep: (step, toolCount) => {
        onProgress?.('step', { step, toolCount });
      },
    });

    onProgress?.('completed', { result: response });
    return response;
  } catch (error: any) {
    onProgress?.('error', { error: error.message });
    throw error;
  }
}
