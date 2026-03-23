/**
 * 游戏与 SDK 集成模块
 *
 * 连接 ByteValley 游戏的 Agent 系统和 Claude SDK
 *
 * 使用方式：
 * 1. 在游戏启动时调用 initializeGameSDK()
 * 2. 使用 addSDKAgent() 替换原来的 addAgent()
 * 3. 使用 triggerSDKState() 替换原来的 triggerState()
 * 4. 使用 removeSDKAgent() 处理机器人删除
 */

import type { GameAgentConfig, BridgeEvent } from './types';

// 重新定义游戏中的类型（避免循环依赖）
export type AgentState = 'IDLE' | 'THINKING' | 'READING' | 'WRITING' | 'EXECUTING' | 'SUCCESS' | 'ERROR' | 'AWAITING_APPROVAL' | 'PLANNING';

export interface Agent {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  state: AgentState;
  speed: number;
  frame: number;
  facing: 'left' | 'right';
  animationVariant: number;
  overrideMode?: 'moving' | 'waiting' | 'dragging' | 'moving_to_emergency';
  color: string;
  message: string;
  overrideTimeout: number | null;
}
import { getAgentBridge } from './AgentBridge';
import { createSDKAgent } from './sdkConfig';

// ==================== 游戏机器人到 SDK 的映射 ====================

interface GameSDKMapping {
  gameAgent: Agent;
  sdkAgentId: string;
  sdkAgent: any;
}

const mappings = new Map<string, GameSDKMapping>();

// ==================== 状态映射 ====================

/**
 * 游戏状态到 SDK 状态的映射（已经是相同的）
 */
const GAME_STATE_TO_SDK: Record<AgentState, import('./types').AgentGameState> = {
  'IDLE': 'IDLE',
  'THINKING': 'THINKING',
  'READING': 'READING',
  'WRITING': 'WRITING',
  'EXECUTING': 'EXECUTING',
  'SUCCESS': 'SUCCESS',
  'ERROR': 'ERROR',
  'AWAITING_APPROVAL': 'AWAITING_APPROVAL',
  'PLANNING': 'PLANNING',
};

/**
 * SDK 状态到游戏状态的映射
 */
const SDK_STATE_TO_GAME: Record<import('./types').AgentGameState, AgentState> = {
  'IDLE': 'IDLE',
  'THINKING': 'THINKING',
  'READING': 'READING',
  'WRITING': 'WRITING',
  'EXECUTING': 'EXECUTING',
  'SUCCESS': 'SUCCESS',
  'ERROR': 'ERROR',
  'AWAITING_APPROVAL': 'AWAITING_APPROVAL',
  'PLANNING': 'PLANNING',
};

// ==================== 初始化 ====================

/**
 * 初始化游戏 SDK 系统
 * 在游戏启动时调用
 */
export async function initializeGameSDK(): Promise<void> {
  const bridge = getAgentBridge();

  console.log('🎮 Initializing Game SDK...');

  // 设置事件监听：SDK 状态变化 → 游戏状态更新
  // 这需要在游戏组件中设置回调，因为游戏状态更新需要调用 setState
}

/**
 * 设置游戏状态更新回调
 * 当 SDK 触发状态变化时，调用此回调来更新游戏中的机器人状态
 */
let gameStateUpdateCallback: ((agentId: string, state: AgentState, message: string) => void) | null = null;

/**
 * 用户问题回调
 * 当 SDK 需要向用户提问时，调用此回调
 */
let userQuestionCallback: ((question: {
  id: string;
  agentId: string;
  question: string;
  options?: string[];
  multiple?: boolean;
}) => Promise<string | string[]>) | null = null;

// 标记是否已经注册了 user_question 事件监听器
let userQuestionListenerRegistered = false;

export function setGameStateUpdateCallback(
  callback: (agentId: string, state: AgentState, message: string) => void
): void {
  gameStateUpdateCallback = callback;

  // 同时设置 bridge 的事件监听
  const bridge = getAgentBridge();

  const handleStateChange = (event: BridgeEvent) => {
    if (event.type === 'state_changed' && gameStateUpdateCallback) {
      const sdkState = event.data.newState;
      const gameState = SDK_STATE_TO_GAME[sdkState];
      const message = event.data.reason || `State changed to ${gameState}`;
      gameStateUpdateCallback(event.agentId, gameState, message);
    }
  };

  bridge.on('state_changed', handleStateChange);

  // 监听工具使用事件，更新消息
  bridge.on('tool_use', (event: BridgeEvent) => {
    if (gameStateUpdateCallback) {
      const { toolName } = event.data;
      gameStateUpdateCallback(
        event.agentId,
        SDK_STATE_TO_GAME[event.data.targetState || 'THINKING'],
        `Using tool: ${toolName}...`
      );
    }
  });

  // 监听工具结果事件
  bridge.on('tool_result', (event: BridgeEvent) => {
    if (gameStateUpdateCallback) {
      const { toolName, result } = event.data;
      const gameState = result.success ? 'THINKING' : 'ERROR';
      gameStateUpdateCallback(
        event.agentId,
        gameState,
        `Tool ${toolName}: ${result.success ? '✅ Done' : '❌ Failed'}`
      );
    }
  });

  // 监听消息事件
  bridge.on('message', (event: BridgeEvent) => {
    if (gameStateUpdateCallback) {
      // 消息事件不改变状态，但更新显示
      gameStateUpdateCallback(event.agentId, 'THINKING', event.data.content);
    }
  });
}

/**
 * 设置用户问题回调
 * 当 SDK 需要向用户提问时，调用此回调
 */
export function setUserQuestionCallback(
  callback: (question: {
    id: string;
    agentId: string;
    question: string;
    options?: string[];
    multiple?: boolean;
  }) => Promise<string | string[]>
): void {
  console.log('[gameIntegration] setUserQuestionCallback called');
  userQuestionCallback = callback;

  // 同时设置到 AgentBridge
  const bridge = getAgentBridge();
  bridge.setupUserQuestionCallback();
  bridge.setupParallelExecutionCallback();

  // 注册 user_question 事件监听器（只注册一次）
  if (!userQuestionListenerRegistered) {
    console.log('[gameIntegration] Registering user_question event listener');
    bridge.on('user_question', (event: BridgeEvent) => {
      console.log('[gameIntegration] user_question event received:', event);
      if (userQuestionCallback) {
        const { question } = event.data;
        console.log('[gameIntegration] Calling userQuestionCallback with:', question);
        userQuestionCallback({
          id: question.id,
          agentId: event.agentId,
          question: question.question,
          options: question.options,
          multiple: question.multiple,
        });
      } else {
        console.error('[gameIntegration] userQuestionCallback is NOT SET!');
      }
    });
    userQuestionListenerRegistered = true;
    console.log('[gameIntegration] user_question listener registered');
  }
  console.log('[gameIntegration] setUserQuestionCallback completed');
}

/**
 * 回答用户问题
 * 从 UI 调用此函数来回答 SDK 提出的问题
 */
export function answerUserQuestion(
  questionId: string,
  answer: string | string[]
): boolean {
  const bridge = getAgentBridge();
  return bridge.answerQuestion(questionId, answer);
}

// ==================== 机器人管理 ====================

/**
 * 添加一个新的 SDK 机器人
 * 替换游戏中的 addAgent 函数
 *
 * @param gameAgent 游戏中的 Agent 对象
 * @param colors 颜色数组（用于分配颜色）
 * @returns 完整的游戏 Agent 对象
 */
export async function addSDKAgent(
  baseAgent: Partial<Agent>,
  colors: string[]
): Promise<Agent> {
  // 生成游戏 Agent
  const agentId = baseAgent.id || `agent-${Math.random().toString(36).substr(2, 9)}`;
  const colorIndex = mappings.size % colors.length;

  const gameAgent: Agent = {
    id: agentId,
    x: baseAgent.x || 688,  // 默认在中间
    y: baseAgent.y || 420,
    targetX: baseAgent.targetX || 688,
    targetY: baseAgent.targetY || 420,
    state: baseAgent.state || 'IDLE',
    message: baseAgent.message || 'Hello! I\'m ready to help.',
    color: baseAgent.color || colors[colorIndex],
    facing: baseAgent.facing || 'right',
    speed: baseAgent.speed || 150,
    frame: 0,
    animationVariant: Math.floor(Math.random() * 3),
    overrideMode: undefined,
    overrideTimeout: null,
  };

  // 创建 SDK Agent
  try {
    console.log(`[gameIntegration] Creating SDK agent for ${agentId}...`);
    const sdkAgent = await createSDKAgent();

    // 注册到 Bridge
    const bridge = getAgentBridge();
    bridge.registerAgent(
      {
        id: agentId,
        name: `Agent ${agentId}`,
        apiKey: sdkAgent.config.apiKey,
        model: sdkAgent.config.model,
      },
      sdkAgent
    );

    // 保存映射
    mappings.set(agentId, {
      gameAgent,
      sdkAgentId: agentId,
      sdkAgent,
    });

    console.log(`✅ SDK Agent registered: ${agentId}`, {
      bridgeAgents: Array.from(bridge.getAllAgents().keys())
    });
  } catch (error) {
    console.error(`❌ Failed to create SDK agent for ${agentId}:`, error);
    // 即使 SDK 创建失败，也返回 gameAgent，让游戏能继续运行
  }

  return gameAgent;
}

/**
 * 移除 SDK 机器人
 * 在游戏删除机器人时调用
 */
export function removeSDKAgent(agentId: string): void {
  const mapping = mappings.get(agentId);
  if (mapping) {
    const bridge = getAgentBridge();
    bridge.unregisterAgent(agentId);
    mappings.delete(agentId);
    console.log(`🗑️ SDK Agent removed: ${agentId}`);
  }
}

/**
 * 获取 SDK Agent
 */
export function getSDKAgent(agentId: string): any | null {
  return mappings.get(agentId)?.sdkAgent || null;
}

/**
 * 获取所有已注册的 SDK Agent ID
 */
export function getSDKAgentIds(): string[] {
  return Array.from(mappings.keys());
}

// ==================== 状态控制 ====================

/**
 * 触发 SDK 状态变化
 * 替换游戏中的 triggerState 函数
 *
 * @param newState 新状态
 * @param msg 消息
 * @param agentId 机器人 ID（可选，默认随机选择）
 */
export function triggerSDKState(
  newState: AgentState,
  msg: string,
  agentId?: string
): void {
  const bridge = getAgentBridge();
  const allAgents = bridge.getAllAgents();

  // 如果没有指定 agentId，随机选择一个
  let targetAgentId = agentId;
  if (!targetAgentId && allAgents.size > 0) {
    const ids = Array.from(allAgents.keys());
    targetAgentId = ids[Math.floor(Math.random() * ids.length)];
  }

  if (!targetAgentId) {
    console.warn('No agents available to trigger state');
    return;
  }

  // 通过 bridge 设置状态（会触发事件，然后更新游戏）
  bridge.setAgentState(targetAgentId, GAME_STATE_TO_SDK[newState]);
}

// ==================== 任务执行 ====================

/**
 * 为机器人执行 SDK 任务
 *
 * @param agentId 机器人 ID
 * @param title 任务标题
 * @param description 任务描述
 * @param workingDirectory 工作目录（可选）
 * @param sdkPrompt 发送给 SDK 的提示词（可选）
 * @returns 执行结果
 */
export async function executeSDKTask(
  agentId: string,
  title: string,
  description: string,
  workingDirectory?: string,
  sdkPrompt?: string
): Promise<string> {
  const bridge = getAgentBridge();

  // 如果没有提供工作目录，使用默认值
  const finalWorkingDir = workingDirectory || (() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('bytevalley-working-dir') || 'D:\\work_data\\claude_workspace\\ByteValley';
    }
    return '/mnt/d/work_data/claude_workspace/ByteValley';
  })();

  const task = {
    id: bridge.generateTaskId(),
    title,
    description,
    status: 'TODO' as const,
    createdAt: Date.now(),
    source: 'MANUAL' as const,
    sdkPrompt,
    workingDirectory: finalWorkingDir,
  };

  console.log('[gameIntegration] executeSDKTask:', { agentId, workingDirectory: finalWorkingDir });

  return bridge.executeTask(agentId, task);
}

/**
 * 流式执行 SDK 任务（支持实时进度反馈）
 *
 * @param agentId 机器人 ID
 * @param title 任务标题
 * @param description 任务描述
 * @param workingDirectory 工作目录（可选）
 * @param sdkPrompt 发送给 SDK 的提示词（可选）
 * @param onChunk 实时数据回调
 * @returns 执行结果
 */
export async function executeSDKTaskStream(
  agentId: string,
  title: string,
  description: string,
  workingDirectory: string | undefined,
  onChunk: (chunk: {
    type: 'text' | 'tool_use' | 'tool_result' | 'done' | 'error' | 'state_change';
    data: any;
  }) => void,
  sdkPrompt?: string
): Promise<string> {
  const bridge = getAgentBridge();

  // 如果没有提供工作目录，使用默认值
  const finalWorkingDir = workingDirectory || (() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('bytevalley-working-dir') || 'D:\\work_data\\claude_workspace\\ByteValley';
    }
    return '/mnt/d/work_data/claude_workspace/ByteValley';
  })();

  const mapping = mappings.get(agentId);
  if (!mapping?.sdkAgent) {
    const error = `SDK agent not found: ${agentId}`;
    onChunk({ type: 'error', data: { message: error } });
    throw new Error(error);
  }

  console.log('[gameIntegration] executeSDKTaskStream:', { agentId, workingDirectory: finalWorkingDir });

  // 发送初始状态
  onChunk({ type: 'state_change', data: { state: 'THINKING', message: 'Starting task...' } });

  let finalResponse = '';

  try {
    // 使用 SDK 的 run 方法，通过回调实现流式效果
    const result = await mapping.sdkAgent.run(description, {
      workingDirectory: finalWorkingDir,
      maxTokens: 8192,
      // 文本流式回调
      onMessage: (content: string) => {
        finalResponse = content;
        onChunk({ type: 'text', data: { content } });
      },
      // 工具调用回调
      onToolUse: (name: string, input: any) => {
        // 只发送一次，直接设为执行中状态（简化版）
        onChunk({
          type: 'tool_use',
          data: {
            toolName: name,
            input,
            targetState: TOOL_TO_STATE[name] || 'THINKING',
            status: 'executing'
          }
        });
        onChunk({ type: 'state_change', data: { state: TOOL_TO_STATE[name] || 'THINKING', message: `Using tool: ${name}...` } });
      },
      // 工具结果回调
      onToolResult: (name: string, result: any) => {
        onChunk({
          type: 'tool_result',
          data: {
            toolName: name,
            result,
            success: result.success
          }
        });
        // 工具执行后回到思考状态
        onChunk({ type: 'state_change', data: { state: 'THINKING', message: `Completed tool: ${name}` } });
      },
    });

    // 任务完成
    onChunk({ type: 'done', data: { result } });
    onChunk({ type: 'state_change', data: { state: 'IDLE', message: 'Task completed' } });

    return result;
  } catch (error: any) {
    onChunk({ type: 'error', data: { message: error.message } });
    onChunk({ type: 'state_change', data: { state: 'ERROR', message: `Error: ${error.message}` } });
    throw error;
  }
}

// 工具到状态的映射
const TOOL_TO_STATE: Record<string, import('./types').AgentGameState> = {
  'read_file': 'READING',
  'search_files': 'READING',
  'list_files': 'READING',
  'glob_files': 'READING',
  'write_file': 'WRITING',
  'edit_file': 'WRITING',
  'run_command': 'EXECUTING',
  'ask_user_question': 'AWAITING_APPROVAL',
  'create_plan': 'PLANNING',
};

/**
 * 快速查询（不触发工具）
 *
 * @param agentId 机器人 ID
 * @param prompt 查询内容
 * @returns 响应内容
 */
export async function quickSDKQuery(
  agentId: string,
  prompt: string
): Promise<string> {
  const mapping = mappings.get(agentId);
  if (!mapping?.sdkAgent) {
    throw new Error(`SDK agent not found: ${agentId}`);
  }

  // 更新状态为思考
  triggerSDKState('THINKING', prompt, agentId);

  try {
    const result = await mapping.sdkAgent.query(prompt);
    // 完成后回到空闲
    triggerSDKState('IDLE', 'Query completed', agentId);
    return result;
  } catch (error) {
    triggerSDKState('ERROR', `Query failed: ${error}`, agentId);
    throw error;
  }
}

// ==================== 工具函数 ====================

/**
 * 检查机器人是否有 SDK
 */
export function hasSDK(agentId: string): boolean {
  return mappings.has(agentId);
}

/**
 * 获取映射信息
 */
export function getMapping(agentId: string): GameSDKMapping | undefined {
  return mappings.get(agentId);
}

/**
 * 清理所有 SDK 机器人
 */
export function cleanupAllSDKAgents(): void {
  const bridge = getAgentBridge();
  mappings.forEach((_, agentId) => {
    bridge.unregisterAgent(agentId);
  });
  mappings.clear();
}
