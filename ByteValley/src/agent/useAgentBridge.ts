/**
 * React Hook for AgentBridge
 *
 * 提供简单的 React 接口来使用 AgentBridge
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import type {
  BridgeEvent,
  AgentGameState,
  GameZone,
  AgentTask,
  GameAgentConfig,
} from './types';
import {
  getAgentBridge,
  type AgentBridge,
} from './AgentBridge';

// ==================== Hook 返回类型 ====================

export interface AgentStateData {
  state: AgentGameState;
  zone: GameZone;
  task: AgentTask | null;
}

export interface UseAgentBridgeReturn {
  // 机器人管理
  registerAgent: (config: GameAgentConfig, sdkAgent: any) => void;
  unregisterAgent: (agentId: string) => void;
  getAgentState: (agentId: string) => AgentStateData | null;

  // 所有机器人的状态
  allAgentStates: Record<string, AgentStateData>;

  // 任务执行
  executeTask: (agentId: string, task: AgentTask) => Promise<string>;
  cancelTask: (agentId: string) => boolean;

  // 手动状态控制
  setAgentState: (agentId: string, state: AgentGameState) => void;

  // 任务管理
  getAllTasks: () => AgentTask[];
  getExecutionLog: (agentId: string) => any[];

  // 事件监听
  onEvent: (eventType: BridgeEvent['type'], callback: (event: BridgeEvent) => void) => void;
  offEvent: (eventType: BridgeEvent['type'], callback: (event: BridgeEvent) => void) => void;
}

// ==================== 主 Hook ====================

export function useAgentBridge(): UseAgentBridgeReturn {
  const bridgeRef = useRef<AgentBridge>(getAgentBridge());
  const [allAgentStates, setAllAgentStates] = useState<Record<string, AgentStateData>>({});
  const [, forceUpdate] = useState({});

  // 触发重新渲染
  const triggerUpdate = useCallback(() => {
    setAllAgentStates(getCurrentAgentStates(bridgeRef.current));
    forceUpdate({});
  }, []);

  // 注册机器人
  const registerAgent = useCallback((config: GameAgentConfig, sdkAgent: any) => {
    bridgeRef.current.registerAgent(config, sdkAgent);
    triggerUpdate();
  }, [triggerUpdate]);

  // 注销机器人
  const unregisterAgent = useCallback((agentId: string) => {
    bridgeRef.current.unregisterAgent(agentId);
    triggerUpdate();
  }, [triggerUpdate]);

  // 获取机器人状态
  const getAgentState = useCallback((agentId: string): AgentStateData | null => {
    return bridgeRef.current.getAgentState(agentId);
  }, []);

  // 执行任务
  const executeTask = useCallback(async (agentId: string, task: AgentTask) => {
    const result = await bridgeRef.current.executeTask(agentId, task);
    triggerUpdate();
    return result;
  }, [triggerUpdate]);

  // 取消任务
  const cancelTask = useCallback((agentId: string) => {
    const result = bridgeRef.current.cancelTask(agentId);
    triggerUpdate();
    return result;
  }, [triggerUpdate]);

  // 设置状态
  const setAgentState = useCallback((agentId: string, state: AgentGameState) => {
    bridgeRef.current.setAgentState(agentId, state);
  }, []);

  // 获取所有任务
  const getAllTasks = useCallback(() => {
    return bridgeRef.current.getAllTasks();
  }, []);

  // 获取执行日志
  const getExecutionLog = useCallback((agentId: string) => {
    return bridgeRef.current.getExecutionLog(agentId);
  }, []);

  // 监听事件
  const onEvent = useCallback((eventType: BridgeEvent['type'], callback: (event: BridgeEvent) => void) => {
    bridgeRef.current.on(eventType, callback);
  }, []);

  // 取消监听事件
  const offEvent = useCallback((eventType: BridgeEvent['type'], callback: (event: BridgeEvent) => void) => {
    bridgeRef.current.off(eventType, callback);
  }, []);

  // 自动监听所有状态变化事件来更新 UI
  useEffect(() => {
    const bridge = bridgeRef.current;

    const handleStateChange = () => {
      setAllAgentStates(getCurrentAgentStates(bridge));
    };

    const eventTypes: BridgeEvent['type'][] = [
      'state_changed',
      'zone_changed',
      'task_started',
      'task_completed',
      'task_failed',
    ];

    eventTypes.forEach(type => {
      bridge.on(type, handleStateChange);
    });

    // 初始化状态
    handleStateChange();

    return () => {
      eventTypes.forEach(type => {
        bridge.off(type, handleStateChange);
      });
    };
  }, []);

  return {
    registerAgent,
    unregisterAgent,
    getAgentState,
    allAgentStates,
    executeTask,
    cancelTask,
    setAgentState,
    getAllTasks,
    getExecutionLog,
    onEvent,
    offEvent,
  };
}

// ==================== 辅助函数 ====================

function getCurrentAgentStates(bridge: AgentBridge): Record<string, AgentStateData> {
  const states: Record<string, AgentStateData> = {};
  bridge.getAllAgents().forEach((_, agentId) => {
    const state = bridge.getAgentState(agentId);
    if (state) {
      states[agentId] = state;
    }
  });
  return states;
}

// ==================== 便捷 Hook ====================

/**
 * 监听特定机器人的状态
 */
export function useAgentState(agentId: string): AgentStateData | null {
  const [state, setState] = useState<AgentStateData | null>(null);
  const bridge = getAgentBridge();

  useEffect(() => {
    const updateState = () => {
      setState(bridge.getAgentState(agentId));
    };

    updateState();

    const events: BridgeEvent['type'][] = ['state_changed', 'zone_changed', 'task_started', 'task_completed', 'task_failed'];
    events.forEach(type => bridge.on(type, updateState));

    return () => {
      events.forEach(type => bridge.off(type, updateState));
    };
  }, [agentId]);

  return state;
}

/**
 * 监听特定事件类型
 */
export function useAgentEvent(
  eventType: BridgeEvent['type'],
  callback: (event: BridgeEvent) => void
): void {
  const bridge = getAgentBridge();

  useEffect(() => {
    bridge.on(eventType, callback);
    return () => {
      bridge.off(eventType, callback);
    };
  }, [eventType, callback]);
}

/**
 * 监听任务列表变化
 */
export function useTasks(): AgentTask[] {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const bridge = getAgentBridge();

  const updateTasks = useCallback(() => {
    setTasks(bridge.getAllTasks());
  }, []);

  useEffect(() => {
    updateTasks();

    const events: BridgeEvent['type'][] = ['task_started', 'task_completed', 'task_failed'];
    events.forEach(type => bridge.on(type, updateTasks));

    return () => {
      events.forEach(type => bridge.off(type, updateTasks));
    };
  }, [updateTasks]);

  return tasks;
}
