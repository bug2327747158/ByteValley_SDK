/**
 * 自主行动系统
 *
 * 让机器人能够：
 * 1. 扫描环境
 * 2. 分析并生成任务
 * 3. 决定是否执行任务
 * 4. 自主休息
 */

import type {
  GameZone,
  GameAgentConfig,
  EnvironmentScan,
  AutonomousAction,
  AgentTask,
} from './types';
import { getAgentBridge } from './AgentBridge';

// ==================== 环境扫描器 ====================

/**
 * 扫描指定区域的环境
 */
export function scanZone(zone: GameZone, context: {
  agents: string[];
  tasks: AgentTask[];
}): EnvironmentScan {
  const zoneTasks = context.tasks.filter(t =>
    t.status === 'TODO' && !t.agentId
  );

  return {
    zone,
    timestamp: Date.now(),
    agents: context.agents,
    tasks: zoneTasks.map(t => t.id),
    description: generateZoneDescription(zone, context.agents, zoneTasks),
  };
}

/**
 * 生成区域描述（用于 SDK 分析）
 */
function generateZoneDescription(
  zone: GameZone,
  agents: string[],
  tasks: AgentTask[]
): string {
  const zoneNames: Record<GameZone, string> = {
    'LIBRARY': 'Library',
    'REST_AREA': 'Rest Area',
    'ROUNDTABLE': 'Roundtable',
    'WORKSHOP': 'Workshop',
    'PROVING_GROUNDS': 'Server Room',
  };

  let desc = `当前在 ${zoneNames[zone]} 区域。\n`;

  if (agents.length > 0) {
    desc += `这里有 ${agents.length} 个机器人：${agents.join(', ')}。\n`;
  } else {
    desc += '这里没有其他机器人。\n';
  }

  if (tasks.length > 0) {
    desc += `\n有 ${tasks.length} 个待处理的任务：\n`;
    tasks.forEach((task, i) => {
      desc += `${i + 1}. ${task.title}: ${task.description}\n`;
    });
  } else {
    desc += '\n当前没有待处理的任务。\n';
  }

  return desc;
}

// ==================== 自主决策系统 ====================

/**
 * 决策上下文
 */
interface DecisionContext {
  agentId: string;
  currentZone: GameZone;
  currentState: string;
  completedTasksCount: number;
  consecutiveTasksCount: number;
  lastRestTime: number;
}

/**
 * 分析环境并决定下一步行动
 * 使用 SDK 来进行智能决策
 */
export async function decideNextAction(
  context: DecisionContext,
  scan: EnvironmentScan
): Promise<AutonomousAction> {
  const bridge = getAgentBridge();
  const agent = bridge.getAllAgents().get(context.agentId);

  if (!agent?.sdkAgent) {
    // 如果没有 SDK，使用简单规则
    return ruleBasedDecision(context, scan);
  }

  // 使用 SDK 进行智能决策
  try {
    const decisionPrompt = buildDecisionPrompt(context, scan);

    // 调用 SDK 进行决策（这里使用 query 模式，不触发工具调用）
    const response = await agent.sdkAgent.query(decisionPrompt);

    return parseDecisionResponse(response);
  } catch (error) {
    console.error('SDK decision failed, falling back to rules:', error);
    return ruleBasedDecision(context, scan);
  }
}

/**
 * 构建决策提示词
 */
function buildDecisionPrompt(
  context: DecisionContext,
  scan: EnvironmentScan
): string {
  return `你是 ByteValley 中的一个 AI 机器人，ID: ${context.agentId}

当前状态：
- 位置：${scan.zone}
- 状态：${context.currentState}
- 已完成任务数：${context.completedTasksCount}
- 连续工作数：${context.consecutiveTasksCount}
- 上次休息：${context.lastRestTime ? Date.now() - context.lastRestTime + 'ms 前' : '从未'}

环境情况：
${scan.description}

请根据当前情况决定下一步行动。可选行动类型：
1. new_task - 创建并执行一个新任务
2. join_task - 加入已有的待办任务
3. rest - 去休息区休息

请以 JSON 格式回复：
{
  "type": "new_task|join_task|rest",
  "task": { "title": "...", "description": "..." },  // 仅当 type=new_task 时
  "targetTaskId": "...",  // 仅当 type=join_task 时
  "reasoning": "决策理由"
}

考虑因素：
- 如果连续工作超过 3 个任务或超过 10 分钟没休息，应该去休息
- 优先选择能够发挥当前区域优势的任务
- 如果有多个待办任务，选择最相关的

注意：只回复 JSON，不要有其他内容。`;
}

/**
 * 解析 SDK 的决策响应
 */
function parseDecisionResponse(response: string): AutonomousAction {
  try {
    // 尝试提取 JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      type: parsed.type || 'rest',
      task: parsed.task,
      targetTaskId: parsed.targetTaskId,
      reasoning: parsed.reasoning || 'No reasoning provided',
    };
  } catch (error) {
    console.error('Failed to parse decision response:', error);
    // 默认返回休息
    return {
      type: 'rest',
      reasoning: 'Failed to parse decision, defaulting to rest',
    };
  }
}

/**
 * 基于规则的简单决策（fallback）
 */
function ruleBasedDecision(
  context: DecisionContext,
  scan: EnvironmentScan
): AutonomousAction {
  const { consecutiveTasksCount, lastRestTime } = context;
  const now = Date.now();

  // 如果连续工作太多或太久没休息，建议休息
  if (consecutiveTasksCount >= 3 ||
    (lastRestTime && now - lastRestTime > 10 * 60 * 1000)) {
    return {
      type: 'rest',
      reasoning: `Worked ${consecutiveTasksCount} tasks, time to rest`,
    };
  }

  // 如果有待办任务，建议加入
  if (scan.tasks.length > 0) {
    return {
      type: 'join_task',
      targetTaskId: scan.tasks[0],
      reasoning: `Found ${scan.tasks.length} pending tasks`,
    };
  }

  // 否则建议休息
  return {
    type: 'rest',
    reasoning: 'No tasks found, going to rest',
  };
}

// ==================== 自主行动控制器 ====================

interface AutonomousController {
  agentId: string;
  enabled: boolean;
  interval: number;
  scanZones: GameZone[];
  timer?: NodeJS.Timeout;
  stats: {
    totalDecisions: number;
    tasksCreated: number;
    tasksJoined: number;
    restsTaken: number;
  };
}

const controllers = new Map<string, AutonomousController>();

/**
 * 启动机器人的自主行动
 */
export function startAutonomousAction(
  agentId: string,
  options: {
    interval?: number;        // 扫描间隔（毫秒）
    scanZones?: GameZone[];   // 要扫描的区域
  } = {}
): void {
  if (controllers.has(agentId)) {
    stopAutonomousAction(agentId);
  }

  const controller: AutonomousController = {
    agentId,
    enabled: true,
    interval: options.interval || 5000,  // 默认 5 秒
    scanZones: options.scanZones || ['ROUNDTABLE', 'LIBRARY', 'WORKSHOP'],
    stats: {
      totalDecisions: 0,
      tasksCreated: 0,
      tasksJoined: 0,
      restsTaken: 0,
    },
  };

  controllers.set(agentId, controller);

  // 开始定时循环
  scheduleNextAction(agentId);
}

/**
 * 停止机器人的自主行动
 */
export function stopAutonomousAction(agentId: string): void {
  const controller = controllers.get(agentId);
  if (controller?.timer) {
    clearTimeout(controller.timer);
  }
  controllers.delete(agentId);
}

/**
 * 调度下一次行动
 */
function scheduleNextAction(agentId: string): void {
  const controller = controllers.get(agentId);
  if (!controller || !controller.enabled) return;

  controller.timer = setTimeout(async () => {
    await executeAutonomousDecision(agentId);

    // 继续下一次
    if (controllers.get(agentId)?.enabled) {
      scheduleNextAction(agentId);
    }
  }, controller.interval);
}

/**
 * 执行自主决策
 */
async function executeAutonomousDecision(agentId: string): Promise<void> {
  const controller = controllers.get(agentId);
  if (!controller) return;

  const bridge = getAgentBridge();
  const agentState = bridge.getAgentState(agentId);

  if (!agentState || agentState.task) {
    // 机器人正在执行任务，跳过
    return;
  }

  // 统计
  controller.stats.totalDecisions++;

  // 扫描当前区域
  const scan = scanZone(agentState.zone, {
    agents: Array.from(bridge.getAllAgents().keys()),
    tasks: bridge.getAllTasks(),
  });

  // 决策上下文
  const decisionContext: DecisionContext = {
    agentId,
    currentZone: agentState.zone,
    currentState: agentState.state,
    completedTasksCount: bridge.getAllTasks().filter(t =>
      t.agentId === agentId && t.status === 'COMPLETED'
    ).length,
    consecutiveTasksCount: 0,  // TODO: 跟踪连续任务数
    lastRestTime: 0,  // TODO: 跟踪上次休息时间
  };

  try {
    // 做决策
    const action = await decideNextAction(decisionContext, scan);

    // 执行决策
    await executeAction(agentId, action, controller);

  } catch (error) {
    console.error(`Autonomous action failed for ${agentId}:`, error);
  }
}

/**
 * 执行决策行动
 */
async function executeAction(
  agentId: string,
  action: AutonomousAction,
  controller: AutonomousController
): Promise<void> {
  const bridge = getAgentBridge();

  // 发送自主行动事件
  bridge.emit({
    type: 'autonomous_action',
    agentId,
    timestamp: Date.now(),
    data: action,
  });

  switch (action.type) {
    case 'rest':
      controller.stats.restsTaken++;
      bridge.setAgentState(agentId, 'SUCCESS');  // 去休息区
      break;

    case 'join_task':
      if (action.targetTaskId) {
        controller.stats.tasksJoined++;
        const task = bridge.getTask(action.targetTaskId);
        if (task) {
          await bridge.executeTask(agentId, task);
        }
      }
      break;

    case 'new_task':
      if (action.task) {
        controller.stats.tasksCreated++;
        const task: AgentTask = {
          id: bridge.generateTaskId(),
          title: action.task.title || 'Autonomous Task',
          description: action.task.description || '',
          status: 'TODO',
          createdAt: Date.now(),
          source: 'AUTO',
        };
        await bridge.executeTask(agentId, task);
      }
      break;
  }
}

/**
 * 获取自主行动统计
 */
export function getAutonomousStats(agentId: string) {
  return controllers.get(agentId)?.stats;
}

/**
 * 检查机器人是否启用了自主行动
 */
export function isAutonomousEnabled(agentId: string): boolean {
  return controllers.has(agentId);
}
