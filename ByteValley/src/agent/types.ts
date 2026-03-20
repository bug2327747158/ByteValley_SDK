/**
 * Agent 集成层类型定义
 * 连接 Claude SDK 和游戏世界
 */

// import type { MessageParam } from "@anthropic-ai/sdk";  // 暂时不需要

// ==================== 游戏状态映射 ====================

/** 游戏中的机器人状态 */
export type AgentGameState = 'IDLE' | 'THINKING' | 'READING' | 'WRITING' | 'EXECUTING' | 'SUCCESS' | 'ERROR' | 'AWAITING_APPROVAL' | 'PLANNING';

/** 游戏中的区域 */
export type GameZone = 'LIBRARY' | 'REST_AREA' | 'ROUNDTABLE' | 'WORKSHOP' | 'PROVING_GROUNDS';

// ==================== SDK 工具映射 ====================

/** SDK 工具名称到游戏状态的映射 */
export const TOOL_TO_STATE: Record<string, AgentGameState> = {
  // 文件读取操作 → READING → Library
  'read_file': 'READING',
  'search_files': 'READING',
  'list_files': 'READING',

  // 文件写入操作 → WRITING → Workshop
  'write_file': 'WRITING',
  'edit_file': 'WRITING',

  // 命令执行 → EXECUTING → Server Room
  'run_command': 'EXECUTING',

  // 其他思考型操作
  'default': 'THINKING',
};

/** 状态对应的推荐区域 */
export const STATE_TO_ZONE: Record<AgentGameState, GameZone> = {
  'THINKING': 'ROUNDTABLE',
  'READING': 'LIBRARY',
  'WRITING': 'WORKSHOP',
  'EXECUTING': 'PROVING_GROUNDS',
  'SUCCESS': 'REST_AREA',
  'ERROR': 'ROUNDTABLE',
  'AWAITING_APPROVAL': 'ROUNDTABLE',
  'PLANNING': 'ROUNDTABLE',
  'IDLE': 'ROUNDTABLE',
};

// ==================== Agent 配置 ====================

/** 游戏中的机器人配置 */
export interface GameAgentConfig {
  id: string;                    // 机器人唯一 ID
  name: string;                  // 机器人名称
  apiKey?: string;               // 可选的自定义 API Key
  model?: string;                // 可选的模型名称
  autoAction?: boolean;          // 是否启用自主行动
  autoActionInterval?: number;   // 自主行动扫描间隔（毫秒）
}

// ==================== 任务定义 ====================

/** 任务来源 */
export type TaskSource = 'MANUAL' | 'AUTO' | 'COLLABORATIVE';

/** 游戏任务（扩展自 App.tsx 的 Task） */
export interface AgentTask {
  id: string;
  title: string;
  description: string;
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'PENDING';
  createdAt: number;
  source: TaskSource;            // 任务来源

  // SDK 相关字段
  agentId?: string;              // 负责的机器人 ID
  sdkPrompt?: string;            // 发送给 SDK 的提示词
  executionLog?: TaskExecutionStep[];  // 执行历史
  result?: string;               // 最终结果
  error?: string;                // 错误信息

  // 执行配置
  workingDirectory?: string;     // 工作目录（用于文件操作）
}

/** 任务执行步骤 */
export interface TaskExecutionStep {
  timestamp: number;
  type: 'message' | 'tool_use' | 'tool_result' | 'state_change' | 'error';
  content: string;
  toolName?: string;
  toolInput?: any;
  toolResult?: any;
  oldState?: AgentGameState;
  newState?: AgentGameState;
}

// ==================== 环境感知 ====================

/** 环境扫描结果 */
export interface EnvironmentScan {
  zone: GameZone;
  timestamp: number;
  agents: string[];              // 当前区域的所有 agent ID
  tasks: string[];               // 当前区域的待办任务 ID
  description: string;           // 环境描述（用于 SDK 分析）
}

/** 自主行动决策 */
export interface AutonomousAction {
  type: 'new_task' | 'join_task' | 'collaborate' | 'rest';
  task?: Partial<AgentTask>;     // 如果是新建任务
  targetTaskId?: string;         // 如果是加入已有任务
  reasoning: string;             // 决策理由
}

// ==================== 协作定义 ====================

/** 协作任务 */
export interface CollaborativeTask extends AgentTask {
  subtasks: SubTask[];
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
}

/** 子任务 */
export interface SubTask {
  id: string;
  parentTaskId: string;
  assignedAgentId?: string;
  description: string;
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  dependencies: string[];        // 依赖的其他子任务 ID
  result?: string;
}

// ==================== Bridge 事件 ====================

/** AgentBridge 发出的事件类型 */
export type BridgeEventType =
  | 'state_changed'       // 机器人状态变化
  | 'zone_changed'        // 机器人区域变化
  | 'task_started'        // 任务开始
  | 'task_progress'       // 任务进度更新
  | 'task_completed'      // 任务完成
  | 'task_failed'         // 任务失败
  | 'message'             // 收到消息
  | 'tool_use'            // 使用工具
  | 'tool_result'         // 工具结果
  | 'error'               // 错误
  | 'autonomous_action'   // 自主行动
  | 'user_question';      // 向用户提问

/** Bridge 事件 */
export interface BridgeEvent {
  type: BridgeEventType;
  agentId: string;
  timestamp: number;
  data: any;
}

// ==================== SDK 回调数据 ====================

/** 工具使用回调数据 */
export interface ToolUseCallbackData {
  toolName: string;
  input: any;
  targetState?: AgentGameState;
  targetZone?: GameZone;
}

/** 工具结果回调数据 */
export interface ToolResultCallbackData {
  toolName: string;
  result: { success: boolean; content?: string; error?: string };
  duration: number;
}

/** 消息回调数据 */
export interface MessageCallbackData {
  content: string;
  isPartial: boolean;
}

// ==================== 用户交互 ====================

/** 用户问题 */
export interface UserQuestion {
  id: string;
  agentId: string;
  question: string;
  options?: string[];
  multiple?: boolean;
  timestamp: number;
}

/** 用户回答 */
export interface UserQuestionResponse {
  questionId: string;
  answer: string | string[];
  timestamp: number;
}
