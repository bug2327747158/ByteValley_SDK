/**
 * 多 Agent 协作系统
 *
 * 功能：
 * 1. 将复杂任务分解为子任务
 * 2. 根据机器人状态和能力分配子任务
 * 3. 协调机器人之间的依赖关系
 * 4. 聚合所有机器人的执行结果
 */

import type {
  CollaborativeTask,
  SubTask,
  AgentTask,
  GameAgentConfig,
} from './types';
import { getAgentBridge } from './AgentBridge';

// ==================== 任务分解 ====================

/**
 * 分解配置
 */
export interface DecompositionConfig {
  maxSubtasks: number;        // 最大子任务数
  allowParallel: boolean;      // 是否允许并行执行
  requireApproval: boolean;    // 是否需要人工确认分解结果
}

/**
 * 将复杂任务分解为子任务
 */
export async function decomposeTask(
  task: Omit<AgentTask, 'status' | 'source'>,
  availableAgents: string[],
  config: DecompositionConfig = {
    maxSubtasks: 5,
    allowParallel: true,
    requireApproval: false,
  }
): Promise<CollaborativeTask> {
  const bridge = getAgentBridge();

  // 如果只有一个 agent 或者任务简单，不分解
  if (availableAgents.length <= 1 || isSimpleTask(task)) {
    return {
      ...task,
      status: 'PENDING',
      source: 'COLLABORATIVE',
      subtasks: [{
        id: `${task.id}_sub_0`,
        parentTaskId: task.id,
        description: task.description,
        status: 'TODO',
        dependencies: [],
      }],
    };
  }

  // 使用 SDK 分析任务并生成子任务
  try {
    const subtasks = await analyzeAndDecompose(task, availableAgents, config);

    return {
      ...task,
      status: 'PENDING',
      source: 'COLLABORATIVE',
      subtasks,
    };
  } catch (error) {
    console.error('Task decomposition failed, using single subtask:', error);
    // Fallback: 创建单个子任务
    return {
      ...task,
      status: 'PENDING',
      source: 'COLLABORATIVE',
      subtasks: [{
        id: `${task.id}_sub_0`,
        parentTaskId: task.id,
        description: task.description,
        status: 'TODO',
        dependencies: [],
      }],
    };
  }
}

/**
 * 判断是否为简单任务（不需要分解）
 */
function isSimpleTask(task: Partial<AgentTask>): boolean {
  const simpleKeywords = ['读取', '查看', '列出', '显示', '简单', '单个'];
  const description = task.description?.toLowerCase() || '';

  // 短任务通常是简单的
  if (description.length < 50) return true;

  // 检查关键词
  return simpleKeywords.some(keyword => description.includes(keyword.toLowerCase()));
}

/**
 * 使用 SDK 分析并分解任务
 */
async function analyzeAndDecompose(
  task: Partial<AgentTask>,
  availableAgents: string[],
  config: DecompositionConfig
): Promise<SubTask[]> {
  // 获取任意一个可用的 agent 来进行分析
  const bridge = getAgentBridge();
  const agents = bridge.getAllAgents();
  const analyzerAgent = availableAgents
    .map(id => agents.get(id))
    .find(a => a?.sdkAgent)?.sdkAgent;

  if (!analyzerAgent) {
    throw new Error('No agent available for task analysis');
  }

  const analysisPrompt = buildAnalysisPrompt(task, availableAgents, config);

  try {
    const response = await analyzerAgent.query(analysisPrompt);
    return parseSubtasks(response, task.id || 'task');
  } catch (error) {
    console.error('SDK analysis failed:', error);
    throw error;
  }
}

/**
 * 构建任务分析提示词
 */
function buildAnalysisPrompt(
  task: Partial<AgentTask>,
  availableAgents: string[],
  config: DecompositionConfig
): string {
  return `你是一个任务协调专家。请将以下任务分解为可由多个 AI 机器人协作完成的子任务。

原始任务：
标题: ${task.title}
描述: ${task.description}

可用机器人: ${availableAgents.length} 个
${availableAgents.map(id => `- ${id}`).join('\n')}

要求：
1. 最多分解为 ${config.maxSubtasks} 个子任务
2. 子任务之间应该尽量独立，以便并行执行
3. 每个子任务必须明确描述需要做什么
4. 标识子任务之间的依赖关系

请以 JSON 数组格式回复子任务：
[
  {
    "description": "子任务描述",
    "dependencies": ["其他子任务ID"],
    "notes": "备注（可选）"
  }
]

注意：
- 只回复 JSON 数组，不要有其他内容
- dependencies 使用索引（0, 1, 2...）表示依赖的前面子任务
- 第一个子任务的 dependencies 应该为空数组`;
}

/**
 * 解析子任务 JSON
 */
function parseSubtasks(response: string, parentTaskId: string): SubTask[] {
  try {
    // 提取 JSON 数组
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }

    return parsed.map((item, index) => ({
      id: `${parentTaskId}_sub_${index}`,
      parentTaskId,
      description: item.description || `Subtask ${index + 1}`,
      status: 'TODO' as const,
      dependencies: (item.dependencies || []).map((d: number | string) =>
        typeof d === 'number' ? `${parentTaskId}_sub_${d}` : d
      ),
    }));
  } catch (error) {
    console.error('Failed to parse subtasks:', error);
    throw error;
  }
}

// ==================== 任务分配 ====================

/**
 * 分配策略
 */
export type AssignmentStrategy =
  | 'round_robin'      // 轮询分配
  | 'least_busy'       // 分配给最空闲的
  | 'zone_based'       // 基于区域分配
  | 'random';          // 随机分配

/**
 * 为子任务分配机器人
 */
export function assignSubtasks(
  collaborativeTask: CollaborativeTask,
  availableAgents: string[],
  strategy: AssignmentStrategy = 'least_busy'
): Map<string, string> {  // subtaskId -> agentId
  const assignments = new Map<string, string>();
  const bridge = getAgentBridge();

  // 过滤出可用的 agents（正在处理任务的排除）
  const idleAgents = availableAgents.filter(id => {
    const state = bridge.getAgentState(id);
    return state && !state.task && state.state === 'IDLE';
  });

  if (idleAgents.length === 0) {
    console.warn('No idle agents available for assignment');
    return assignments;
  }

  const unassignedSubtasks = collaborativeTask.subtasks.filter(st =>
    st.status === 'TODO' && !st.assignedAgentId
  );

  // 根据策略分配
  switch (strategy) {
    case 'round_robin':
      assignRoundRobin(unassignedSubtasks, idleAgents, assignments);
      break;
    case 'least_busy':
      assignLeastBusy(unassignedSubtasks, idleAgents, assignments, bridge);
      break;
    case 'zone_based':
      assignZoneBased(unassignedSubtasks, idleAgents, assignments, bridge);
      break;
    case 'random':
      assignRandom(unassignedSubtasks, idleAgents, assignments);
      break;
  }

  return assignments;
}

/**
 * 轮询分配
 */
function assignRoundRobin(
  subtasks: SubTask[],
  agents: string[],
  assignments: Map<string, string>
): void {
  subtasks.forEach((subtask, index) => {
    const agentId = agents[index % agents.length];
    assignments.set(subtask.id, agentId);
    subtask.assignedAgentId = agentId;
  });
}

/**
 * 分配给最空闲的
 */
function assignLeastBusy(
  subtasks: SubTask[],
  agents: string[],
  assignments: Map<string, string>,
  bridge: ReturnType<typeof getAgentBridge>
): void {
  // 按已完成任务数排序
  const sortedAgents = [...agents].sort((a, b) => {
    const aCompleted = bridge.getAllTasks().filter(t =>
      t.agentId === a && t.status === 'COMPLETED'
    ).length;
    const bCompleted = bridge.getAllTasks().filter(t =>
      t.agentId === b && t.status === 'COMPLETED'
    ).length;
    return aCompleted - bCompleted;
  });

  assignRoundRobin(subtasks, sortedAgents, assignments);
}

/**
 * 基于区域分配
 */
function assignZoneBased(
  subtasks: SubTask[],
  agents: string[],
  assignments: Map<string, string>,
  bridge: ReturnType<typeof getAgentBridge>
): void {
  // 根据子任务描述推断需要的区域
  const taskZoneMap = new Map<string, string>();

  subtasks.forEach(subtask => {
    const desc = subtask.description.toLowerCase();
    if (desc.includes('读取') || desc.includes('搜索') || desc.includes('文件')) {
      taskZoneMap.set(subtask.id, 'LIBRARY');
    } else if (desc.includes('写入') || desc.includes('编辑') || desc.includes('修改')) {
      taskZoneMap.set(subtask.id, 'WORKSHOP');
    } else if (desc.includes('执行') || desc.includes('命令') || desc.includes('运行')) {
      taskZoneMap.set(subtask.id, 'PROVING_GROUNDS');
    } else {
      taskZoneMap.set(subtask.id, 'ROUNDTABLE');
    }
  });

  // 为每个子任务分配最近或已在相应区域的 agent
  subtasks.forEach(subtask => {
    const targetZone = taskZoneMap.get(subtask.id);

    // 查找在目标区域或最近的 agent
    const bestAgent = agents.find(agentId => {
      const state = bridge.getAgentState(agentId);
      return state?.zone === targetZone;
    }) || agents[0];

    assignments.set(subtask.id, bestAgent);
    subtask.assignedAgentId = bestAgent;
  });
}

/**
 * 随机分配
 */
function assignRandom(
  subtasks: SubTask[],
  agents: string[],
  assignments: Map<string, string>
): void {
  subtasks.forEach(subtask => {
    const agentId = agents[Math.floor(Math.random() * agents.length)];
    assignments.set(subtask.id, agentId);
    subtask.assignedAgentId = agentId;
  });
}

// ==================== 协作执行 ====================

/**
 * 执行协作任务
 */
export async function executeCollaborativeTask(
  collaborativeTask: CollaborativeTask,
  availableAgents: string[],
  strategy: AssignmentStrategy = 'least_busy'
): Promise<Map<string, string>> {  // subtaskId -> result
  const bridge = getAgentBridge();
  const results = new Map<string, string>();

  // 分配子任务
  const assignments = assignSubtasks(collaborativeTask, availableAgents, strategy);

  if (assignments.size === 0) {
    throw new Error('No agents available for task execution');
  }

  // 更新子任务状态
  collaborativeTask.subtasks.forEach(st => {
    if (assignments.has(st.id)) {
      st.status = 'IN_PROGRESS';
    }
  });

  // 按依赖顺序执行
  const executionOrder = topologicalSort(collaborativeTask.subtasks);

  for (const subtaskId of executionOrder) {
    if (!assignments.has(subtaskId)) continue;

    // 检查依赖是否完成
    const subtask = collaborativeTask.subtasks.find(st => st.id === subtaskId);
    if (!subtask) continue;

    const dependenciesMet = subtask.dependencies.every(depId => {
      const depTask = collaborativeTask.subtasks.find(st => st.id === depId);
      return depTask?.status === 'COMPLETED';
    });

    if (!dependenciesMet) {
      subtask.status = 'FAILED';
      subtask.result = 'Dependencies not met';
      continue;
    }

    // 执行子任务
    const agentId = assignments.get(subtaskId)!;
    try {
      const result = await bridge.executeTask(agentId, {
        id: subtaskId,
        title: `Subtask: ${subtask.description.slice(0, 30)}`,
        description: subtask.description,
        status: 'IN_PROGRESS',
        createdAt: Date.now(),
        source: 'COLLABORATIVE',
      });

      subtask.status = 'COMPLETED';
      subtask.result = result;
      results.set(subtaskId, result);

    } catch (error: any) {
      subtask.status = 'FAILED';
      subtask.result = error.message;
    }
  }

  return results;
}

/**
 * 拓扑排序（处理依赖关系）
 */
function topologicalSort(subtasks: SubTask[]): string[] {
  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(subtaskId: string): void {
    if (visited.has(subtaskId)) return;
    if (visiting.has(subtaskId)) {
      console.warn(`Circular dependency detected: ${subtaskId}`);
      return;
    }

    visiting.add(subtaskId);

    const subtask = subtasks.find(st => st.id === subtaskId);
    if (subtask) {
      subtask.dependencies.forEach(depId => visit(depId));
    }

    visiting.delete(subtaskId);
    visited.add(subtaskId);
    sorted.push(subtaskId);
  }

  subtasks.forEach(st => visit(st.id));

  return sorted;
}

// ==================== 结果聚合 ====================

/**
 * 聚合子任务结果
 */
export async function aggregateResults(
  collaborativeTask: CollaborativeTask,
  subtaskResults: Map<string, string>,
  aggregatorAgentId?: string
): Promise<string> {
  const bridge = getAgentBridge();

  // 如果没有指定聚合器，使用任意一个可用的 agent
  let aggregatorAgent = aggregatorAgentId
    ? bridge.getAllAgents().get(aggregatorAgentId)?.sdkAgent
    : null;

  if (!aggregatorAgent) {
    // 简单聚合
    return simpleAggregate(collaborativeTask, subtaskResults);
  }

  // 使用 SDK 进行智能聚合
  const aggregatePrompt = buildAggregatePrompt(collaborativeTask, subtaskResults);

  try {
    return await aggregatorAgent.query(aggregatePrompt);
  } catch (error) {
    console.error('SDK aggregation failed, using simple method:', error);
    return simpleAggregate(collaborativeTask, subtaskResults);
  }
}

/**
 * 简单聚合（fallback）
 */
function simpleAggregate(
  collaborativeTask: CollaborativeTask,
  subtaskResults: Map<string, string>
): string {
  const lines: string[] = [
    `任务: ${collaborativeTask.title}`,
    '',
    '子任务结果:',
  ];

  collaborativeTask.subtasks.forEach((subtask, index) => {
    const result = subtaskResults.get(subtask.id);
    lines.push(`${index + 1}. ${subtask.description}`);
    lines.push(`   状态: ${subtask.status}`);
    if (result) {
      lines.push(`   结果: ${result.slice(0, 100)}${result.length > 100 ? '...' : ''}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * 构建聚合提示词
 */
function buildAggregatePrompt(
  collaborativeTask: CollaborativeTask,
  subtaskResults: Map<string, string>
): string {
  const resultsText = collaborativeTask.subtasks.map((st, i) => {
    const result = subtaskResults.get(st.id);
    return `${i + 1}. ${st.description}
   状态: ${st.status}
   结果: ${result || '无结果'}`;
  }).join('\n\n');

  return `请将以下协作任务的子任务结果整合成一个完整的总结报告。

原始任务：
${collaborativeTask.title}
${collaborativeTask.description}

子任务结果：
${resultsText}

请提供一个：
1. 简洁的任务完成总结
2. 各子任务的关键发现
3. 最终结论或建议`;
}
