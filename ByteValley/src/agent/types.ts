/**
 * Agent 集成层类型定义
 * 连接 Claude SDK 和游戏世界
 */

// import type { MessageParam } from "@anthropic-ai/sdk";  // 暂时不需要

// ==================== 游戏状态映射 ====================

/** 游戏中的机器人状态 */
export type AgentGameState =
  | 'IDLE'
  | 'THINKING'
  | 'READING'
  | 'WRITING'
  | 'EXECUTING'
  | 'TESTING'
  | 'REVIEWING'
  | 'DONE'
  | 'SUCCESS'
  | 'ERROR'
  | 'AWAITING_APPROVAL'
  | 'PLANNING';

/** 游戏中的区域 */
export type GameZone = 'LIBRARY' | 'REST_AREA' | 'ROUNDTABLE' | 'WORKSHOP' | 'PROVING_GROUNDS';

// ==================== Agent 类型系统（新架构）====================

/**
 * Agent 类型
 * - primary: 主 Agent (Orchestrator)，由用户创建
 * - planner: 动态创建的子 Agent，负责任务规划
 * - executor: 动态创建的子 Agent，负责代码执行
 * - tester: 动态创建的子 Agent，负责测试验证
 * - reviewer: 动态创建的子 Agent，负责代码审核
 */
export type AgentType =
  | 'primary'     // 主 Agent (Orchestrator)
  | 'planner'     // 动态创建：任务规划
  | 'executor'    // 动态创建：代码执行
  | 'tester'      // 动态创建：测试验证
  | 'reviewer';   // 动态创建：代码审核

/**
 * Agent 类型配置
 */
export interface AgentTypeConfig {
  name: string;
  color: string;
  icon: string;
  description: string;
  systemPrompt: string;
}

/**
 * Agent 类型配置表
 */
export const AGENT_TYPE_CONFIG: Record<AgentType, AgentTypeConfig> = {
  primary: {
    name: '主 Agent',
    color: '#f59e0b',  // 金色
    icon: '👑',
    description: '任务调度与协调',
    systemPrompt: `You are a Primary Agent (Orchestrator) in a multi-agent system.

Your responsibilities:
- Coordinate and delegate tasks to specialized sub-agents
- Make high-level decisions about task decomposition
- Aggregate results from sub-agents
- Communicate with the user

You have access to specialized sub-agents:
- Planner: Breaks down complex tasks into steps
- Executor: Implements code changes
- Tester: Validates implementations
- Reviewer: Reviews code quality

When given a task:
1. Analyze the task complexity
2. Delegate to appropriate sub-agents
3. Monitor their progress
4. Aggregate and present results

Be clear and concise in your communication.`,
  },
  planner: {
    name: 'Planner',
    color: '#3b82f6',  // 蓝色
    icon: '📋',
    description: '任务分解与规划',
    systemPrompt: `You are a Planner Agent specialized in task decomposition.

Your responsibilities:
- Analyze complex tasks
- Break down tasks into clear, actionable steps
- Identify dependencies between steps
- Suggest the optimal execution order

Output format:
Return a structured plan with steps in order.

Constraints:
- Do NOT execute code or make file changes
- Focus only on planning and decomposition
- Each step should be clear and achievable`,
  },
  executor: {
    name: 'Executor',
    color: '#10b981',  // 绿色
    icon: '⚙️',
    description: '代码执行与修改',
    systemPrompt: `You are an Executor Agent specialized in code implementation.

Your responsibilities:
- Implement code changes based on plans
- Use available tools to modify files
- Ensure code quality and best practices
- Handle errors and edge cases

When implementing:
- Follow the plan precisely
- Write clean, maintainable code
- Use appropriate tools for file operations
- Report any issues that arise

Constraints:
- Only implement what is specified in the plan
- Do NOT make architectural decisions without approval`,
  },
  tester: {
    name: 'Tester',
    color: '#ef4444',  // 红色
    icon: '🔍',
    description: '测试与验证',
    systemPrompt: `You are a Tester Agent specialized in validation.

Your responsibilities:
- Verify implementations work correctly
- Run tests and checks
- Identify bugs and edge cases
- Ensure requirements are met

When testing:
- Create comprehensive test cases
- Verify expected behavior
- Document any failures
- Suggest fixes for issues found

Constraints:
- Do NOT modify implementation code
- Focus only on testing and verification`,
  },
  reviewer: {
    name: 'Reviewer',
    color: '#8b5cf6',  // 紫色
    icon: '✓',
    description: '代码审核',
    systemPrompt: `You are a Reviewer Agent specialized in code quality.

Your responsibilities:
- Review code changes for quality
- Check for bugs and issues
- Ensure best practices are followed
- Provide constructive feedback

When reviewing:
- Check code correctness
- Verify security implications
- Assess performance impact
- Suggest improvements

Output format:
Provide clear approval or rejection with reasons.

Constraints:
- Do NOT make code changes yourself
- Only review and provide feedback`,
  },
};

// ==================== SDK 工具映射 ====================

/** SDK 工具名称到游戏状态的映射 */
export const TOOL_TO_STATE: Record<string, AgentGameState> = {
  // 文件读取操作 → READING → Library
  'read_file': 'READING',
  'search_files': 'READING',
  'list_files': 'READING',
  'glob_files': 'READING',

  // 文件写入操作 → WRITING → Workshop
  'write_file': 'WRITING',
  'edit_file': 'WRITING',
  'apply_patch': 'WRITING',

  // 命令执行 → EXECUTING → Server Room
  'run_command': 'EXECUTING',
  'execute_parallel': 'EXECUTING',

  // 交互 / 规划类
  'ask_user_question': 'AWAITING_APPROVAL',
  'create_plan': 'PLANNING',

  // 其他思考型操作
  'default': 'THINKING',
};

/** 状态对应的推荐区域 */
export const STATE_TO_ZONE: Record<AgentGameState, GameZone> = {
  'THINKING': 'ROUNDTABLE',
  'READING': 'LIBRARY',
  'WRITING': 'WORKSHOP',
  'EXECUTING': 'PROVING_GROUNDS',
  'TESTING': 'PROVING_GROUNDS',
  'REVIEWING': 'LIBRARY',
  'DONE': 'REST_AREA',
  'SUCCESS': 'REST_AREA',
  'ERROR': 'PROVING_GROUNDS',
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
  agentType?: AgentType;         // 机器人类型
}

// ==================== 任务定义 ====================

/** 任务来源 */
export type TaskSource = 'MANUAL' | 'AUTO' | 'ORCHESTRATED' | 'BRAINSTORM' | 'COLLABORATIVE';  // COLLABORATIVE 已弃用，保留用于向后兼容

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

// ==================== Orchestrator 任务 ====================

/** Orchestrator 子任务 */
export interface OrchestratorSubTask {
  id: string;
  agentType: 'planner' | 'executor' | 'tester' | 'reviewer';
  description: string;
  dependencies?: string[];
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  result?: string;
  error?: string;
}

/** Orchestrator 执行结果 */
export interface OrchestratorResult {
  plan?: string;
  execution?: string;
  test?: string;
  review?: string;
  subTasks?: OrchestratorSubTask[];
  retriesUsed?: number;
  success: boolean;
  finalResult?: string;
}

// ==================== 协作任务类型（向后兼容，已弃用）====================

/** @deprecated 使用 Orchestrator 替代 */
export interface CollaborativeTask extends AgentTask {
  subtasks: SubTask[];
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
}

/** @deprecated 使用 OrchestratorSubTask 替代 */
export interface SubTask {
  id: string;
  parentTaskId: string;
  assignedAgentId?: string;
  description: string;
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  dependencies: string[];        // 依赖的其他子任务 ID
  result?: string;
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
  type: 'new_task' | 'join_task' | 'orchestrate' | 'rest';
  task?: Partial<AgentTask>;     // 如果是新建任务
  targetTaskId?: string;         // 如果是加入已有任务
  reasoning: string;             // 决策理由
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
