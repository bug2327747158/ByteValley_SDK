/**
 * Agent 集成模块
 *
 * 提供 SDK 与游戏世界之间的完整集成
 */

// ==================== 类型导出 ====================

export type {
  // 基础类型
  AgentGameState,
  GameZone,
  TaskSource,

  // 配置
  GameAgentConfig,

  // 任务
  AgentTask,
  TaskExecutionStep,

  // 环境感知
  EnvironmentScan,
  AutonomousAction,

  // 协作
  CollaborativeTask,
  SubTask,

  // 事件
  BridgeEventType,
  BridgeEvent,
  ToolUseCallbackData,
  ToolResultCallbackData,
  MessageCallbackData,
} from './types';

// ==================== 工具导出 ====================

export type { Tool, ToolResult } from './tools';
export { DEFAULT_TOOLS, executeTool } from './tools';

// ==================== SDK 配置导出 ====================

export { createSDKAgent, sdkConfig, getConfigInfo } from './sdkConfig';

// ==================== 游戏集成导出 ====================

export {
  initializeGameSDK,
  setGameStateUpdateCallback,
  addSDKAgent,
  removeSDKAgent,
  getSDKAgent,
  getSDKAgentIds,
  triggerSDKState,
  executeSDKTask,
  quickSDKQuery,
  hasSDK,
  getMapping,
  cleanupAllSDKAgents,
} from './gameIntegration';

// ==================== 常量导出 ====================

export {
  TOOL_TO_STATE,
  STATE_TO_ZONE,
} from './types';

// ==================== AgentBridge 导出 ====================

export {
  AgentBridge,
  getAgentBridge,
  resetAgentBridge,
} from './AgentBridge';

import { getAgentBridge } from './AgentBridge';

// ==================== Autonomy 导出 ====================

export {
  scanZone,
  decideNextAction,
  startAutonomousAction,
  stopAutonomousAction,
  getAutonomousStats,
  isAutonomousEnabled,
} from './Autonomy';

// ==================== TeamCoordination 导出 ====================

export {
  decomposeTask,
  assignSubtasks,
  executeCollaborativeTask,
  aggregateResults,
} from './TeamCoordination';

export type {
  AssignmentStrategy,
  DecompositionConfig,
} from './TeamCoordination';

// ==================== 便捷函数 ====================

/**
 * 快速创建并注册一个机器人
 */
export function createAndRegisterAgent(
  config: import('./types').GameAgentConfig,
  sdkAgent: any
): void {
  const bridge = getAgentBridge();
  bridge.registerAgent(config, sdkAgent);
}

/**
 * 快速创建并执行任务
 */
export async function quickExecute(
  agentId: string,
  title: string,
  description: string,
  sdkPrompt?: string
): Promise<string> {
  const bridge = getAgentBridge();
  const task = {
    id: bridge.generateTaskId(),
    title,
    description,
    status: 'TODO' as const,
    createdAt: Date.now(),
    source: 'MANUAL' as const,
    sdkPrompt,
  };

  return bridge.executeTask(agentId, task);
}

/**
 * 获取所有机器人的当前状态
 */
export function getAllAgentStates(): Record<string, {
  state: import('./types').AgentGameState;
  zone: import('./types').GameZone;
  task: import('./types').AgentTask | null;
}> {
  const bridge = getAgentBridge();
  const states: Record<string, any> = {};

  bridge.getAllAgents().forEach((_, agentId) => {
    states[agentId] = bridge.getAgentState(agentId);
  });

  return states;
}

/**
 * 监听所有机器人事件
 */
export function onAllAgentEvents(
  callback: (event: import('./types').BridgeEvent) => void
): () => void {
  const bridge = getAgentBridge();
  const eventTypes: import('./types').BridgeEventType[] = [
    'state_changed', 'zone_changed', 'task_started', 'task_progress',
    'task_completed', 'task_failed', 'message', 'tool_use', 'tool_result',
    'error', 'autonomous_action'
  ];

  eventTypes.forEach(type => {
    bridge.on(type, callback);
  });

  // 返回清理函数
  return () => {
    eventTypes.forEach(type => {
      bridge.off(type, callback);
    });
  };
}
