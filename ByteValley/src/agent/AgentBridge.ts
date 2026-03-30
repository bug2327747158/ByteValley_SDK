/**
 * AgentBridge - SDK 与游戏世界之间的桥梁
 *
 * 核心功能：
 * 1. 管理 ClaudeAgent 实例（多 agent 支持）
 * 2. 自动将 SDK 工具调用映射到游戏状态
 * 3. 任务执行引擎
 * 4. 事件系统
 * 5. Agent 间消息传递
 * 6. Agent 类型系统支持
 */

import type {
  GameAgentConfig,
  AgentGameState,
  GameZone,
  AgentTask,
  BridgeEvent,
  BridgeEventType,
  ToolUseCallbackData,
  ToolResultCallbackData,
  MessageCallbackData,
  TaskExecutionStep,
  UserQuestion,
  UserQuestionResponse,
  AgentType,
} from './types';
import { TOOL_TO_STATE, STATE_TO_ZONE } from './types';

import {
  setUserQuestionCallback,
  setParallelExecutionCallback,
  setCurrentExecutingAgentId,
  clearCurrentExecutingAgentId,
} from './tools';

import { getMessageQueue, sendMessage as queueSendMessage, broadcastMessage as queueBroadcastMessage, type AgentMessage } from './AgentMessaging';
import { getSharedMemory, type SharedMemory } from './SharedMemory';

// ==================== Agent 实例包装 ====================

interface ManagedAgent {
  config: GameAgentConfig;
  currentState: AgentGameState;
  currentZone: GameZone;
  currentTask: AgentTask | null;
  executionLog: TaskExecutionStep[];
  // SDK agent 实例将在运行时注入
  sdkAgent: any;
  isProcessing: boolean;
}

// ==================== AgentBridge 类 ====================

export class AgentBridge {
  private agents: Map<string, ManagedAgent> = new Map();
  private eventListeners: Map<BridgeEventType, Set<(event: BridgeEvent) => void>> = new Map();
  private tasks: Map<string, AgentTask> = new Map();
  private taskIdCounter = 0;
  private pendingQuestions: Map<string, {
    question: UserQuestion;
    resolve: (answer: string | string[]) => void;
  }> = new Map();
  private questionCounter = 0;

  constructor() {
    // 初始化事件监听器映射
    const eventTypes: BridgeEventType[] = [
      'state_changed', 'zone_changed', 'task_started', 'task_progress',
      'task_completed', 'task_failed', 'message', 'tool_use', 'tool_result',
      'error', 'autonomous_action', 'user_question'  // 添加 user_question 事件类型
    ];
    eventTypes.forEach(type => this.eventListeners.set(type, new Set()));
  }

  // ==================== Agent 管理 ====================

  /**
   * 注册一个新的游戏机器人
   * @param config 机器人配置
   * @param sdkAgent SDK Agent 实例（从外部注入）
   */
  registerAgent(config: GameAgentConfig, sdkAgent: any): void {
    console.log('[AgentBridge] registerAgent called:', config.id);

    const managedAgent: ManagedAgent = {
      config,
      currentState: 'IDLE',
      currentZone: 'ROUNDTABLE',
      currentTask: null,
      executionLog: [],
      sdkAgent,
      isProcessing: false,
    };

    this.agents.set(config.id, managedAgent);

    console.log('[AgentBridge] Agent registered. Total agents:', Array.from(this.agents.keys()));

    // 设置 SDK 回调
    this.setupSDKCallbacks(config.id, sdkAgent);

    this.emit({
      type: 'state_changed',
      agentId: config.id,
      timestamp: Date.now(),
      data: { state: 'IDLE', zone: 'ROUNDTABLE' }
    });
  }

  /**
   * 注销机器人
   */
  unregisterAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent?.currentTask) {
      this.failTask(agent.currentTask.id, 'Agent unregistered');
    }
    this.agents.delete(agentId);
  }

  /**
   * 获取机器人当前状态
   */
  getAgentState(agentId: string): { state: AgentGameState; zone: GameZone; task: AgentTask | null } | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    return {
      state: agent.currentState,
      zone: agent.currentZone,
      task: agent.currentTask,
    };
  }

  /**
   * 获取所有已注册的机器人
   */
  getAllAgents(): Map<string, ManagedAgent> {
    return this.agents;
  }

  // ==================== 状态管理 ====================

  /**
   * 更新机器人状态和区域
   */
  private updateAgentState(
    agentId: string,
    newState: AgentGameState,
    reason: string
  ): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const oldState = agent.currentState;
    const newZone = STATE_TO_ZONE[newState];
    const oldZone = agent.currentZone;

    agent.currentState = newState;

    // 记录执行步骤
    this.logExecutionStep(agentId, {
      timestamp: Date.now(),
      type: 'state_change',
      content: reason,
      oldState,
      newState,
    });

    // 发送状态变化事件
    this.emit({
      type: 'state_changed',
      agentId,
      timestamp: Date.now(),
      data: {
        oldState,
        newState,
        reason,
      },
    });

    // 如果区域也变化了，发送区域变化事件
    if (newZone !== oldZone) {
      agent.currentZone = newZone;
      this.emit({
        type: 'zone_changed',
        agentId,
        timestamp: Date.now(),
        data: {
          oldZone,
          newZone,
          reason: `State changed to ${newState}`,
        },
      });
    }
  }

  /**
   * 手动设置机器人状态（用于游戏 UI 控制）
   */
  setAgentState(agentId: string, state: AgentGameState): void {
    this.updateAgentState(agentId, state, 'Manual state change');
  }

  // ==================== 任务执行 ====================

  /**
   * 为机器人分配任务并执行
   */
  async executeTask(agentId: string, task: AgentTask): Promise<string> {
    console.log('[AgentBridge] executeTask called:', {
      agentId,
      taskId: task.id,
      registeredAgents: Array.from(this.agents.keys()),
      hasAgent: this.agents.has(agentId)
    });

    const agent = this.agents.get(agentId);
    if (!agent) {
      console.error('[AgentBridge] Agent not found. Available agents:', Array.from(this.agents.keys()));
      throw new Error(`Agent ${agentId} not found`);
    }

    if (agent.isProcessing) {
      throw new Error(`Agent ${agentId} is already processing a task`);
    }

    // 更新任务状态
    task.status = 'IN_PROGRESS';
    task.agentId = agentId;
    agent.currentTask = task;
    agent.isProcessing = true;
    this.tasks.set(task.id, task);

    // 清空之前的执行日志
    agent.executionLog = [];

    // 发送任务开始事件
    this.emit({
      type: 'task_started',
      agentId,
      timestamp: Date.now(),
      data: { task },
    });

    try {
      // 切换到思考状态
      this.updateAgentState(agentId, 'THINKING', `Starting task: ${task.title}`);

      // 使用 SDK 执行任务，传递工作目录
      const prompt = task.sdkPrompt || task.description;
      const result = await this.runWithStateTracking(agentId, prompt, task.workingDirectory);

      // 任务完成
      task.status = 'COMPLETED';
      task.result = result;
      agent.currentTask = null;
      agent.isProcessing = false;

      // 切换到成功状态
      this.updateAgentState(agentId, 'SUCCESS', `Task completed: ${task.title}`);

      // 发送任务完成事件
      this.emit({
        type: 'task_completed',
        agentId,
        timestamp: Date.now(),
        data: { task, result },
      });

      return result;

    } catch (error: any) {
      // 任务失败
      task.status = 'FAILED';
      task.error = error.message;
      agent.currentTask = null;
      agent.isProcessing = false;

      // 切换到错误状态
      this.updateAgentState(agentId, 'ERROR', `Task failed: ${error.message}`);

      // 发送任务失败事件
      this.emit({
        type: 'task_failed',
        agentId,
        timestamp: Date.now(),
        data: { task, error: error.message },
      });

      throw error;
    }
  }

  /**
   * 运行 SDK 调用并自动跟踪状态变化
   */
  private async runWithStateTracking(agentId: string, prompt: string, workingDirectory?: string): Promise<string> {
    const agent = this.agents.get(agentId);
    if (!agent?.sdkAgent) {
      throw new Error(`SDK agent not found for ${agentId}`);
    }

    console.log('[AgentBridge] runWithStateTracking:', { agentId, workingDirectory });

    // 设置当前执行的 Agent ID（供工具使用）
    setCurrentExecutingAgentId(agentId);

    // 临时覆盖 SDK 的回调来进行状态跟踪
    const originalOnToolUse = agent.sdkAgent.options?.onToolUse;
    const originalOnToolResult = agent.sdkAgent.options?.onToolResult;
    const originalOnMessage = agent.sdkAgent.options?.onMessage;

    // 注入我们的状态跟踪回调
    const trackedOptions = {
      onMessage: (content: string) => {
        this.logExecutionStep(agentId, {
          timestamp: Date.now(),
          type: 'message',
          content,
        });
        this.emit({
          type: 'message',
          agentId,
          timestamp: Date.now(),
          data: { content, isPartial: false } as MessageCallbackData,
        });
        originalOnMessage?.(content);
      },
      onToolUse: (name: string, input: any) => {
        const targetState = TOOL_TO_STATE[name] || 'THINKING';
        this.updateAgentState(agentId, targetState, `Using tool: ${name}`);

        this.logExecutionStep(agentId, {
          timestamp: Date.now(),
          type: 'tool_use',
          content: `Using tool: ${name}`,
          toolName: name,
          toolInput: input,
        });

        this.emit({
          type: 'tool_use',
          agentId,
          timestamp: Date.now(),
          data: {
            toolName: name,
            input,
            targetState,
            targetZone: STATE_TO_ZONE[targetState],
          } as ToolUseCallbackData,
        });

        originalOnToolUse?.(name, input);
      },
      onToolResult: (name: string, result: any) => {
        this.logExecutionStep(agentId, {
          timestamp: Date.now(),
          type: 'tool_result',
          content: `Tool ${name} ${result.success ? 'succeeded' : 'failed'}`,
          toolName: name,
          toolResult: result,
        });

        this.emit({
          type: 'tool_result',
          agentId,
          timestamp: Date.now(),
          data: {
            toolName: name,
            result,
            duration: 0, // TODO: 计算实际时长
          } as ToolResultCallbackData,
        });

        // 工具执行后，回到思考状态
        this.updateAgentState(agentId, 'THINKING', `Completed tool: ${name}`);

        originalOnToolResult?.(name, result);
      },
      workingDirectory,  // 传递工作目录给 SDK
    };

    console.log('[AgentBridge] Calling SDK agent.run with working directory:', workingDirectory);

    // 执行 SDK 调用
    try {
      if (typeof agent.sdkAgent.run === 'function') {
        return await agent.sdkAgent.run(prompt, trackedOptions);
      } else if (typeof agent.sdkAgent.query === 'function') {
        // 使用query方法（无工具）
        trackedOptions.onMessage?.('Thinking...');
        return await agent.sdkAgent.query(prompt);
      } else {
        throw new Error(`Unsupported SDK agent interface for ${agentId}`);
      }
    } finally {
      // 清除当前执行的 Agent ID
      clearCurrentExecutingAgentId();
    }
  }

  /**
   * 取消当前任务
   */
  cancelTask(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || !agent.currentTask) return false;

    const task = agent.currentTask;
    agent.currentTask = null;
    agent.isProcessing = false;

    this.updateAgentState(agentId, 'IDLE', 'Task cancelled');

    this.emit({
      type: 'task_failed',
      agentId,
      timestamp: Date.now(),
      data: { task, error: 'Cancelled by user' },
    });

    return true;
  }

  // ==================== SDK 回调设置 ====================

  /**
   * 设置 SDK 回调
   */
  private setupSDKCallbacks(agentId: string, sdkAgent: any): void {
    // 回调已通过 runWithStateTracking 动态设置
    // 这里可以设置一些全局的错误处理等
  }

  // ==================== 执行日志 ====================

  /**
   * 记录执行步骤
   */
  private logExecutionStep(agentId: string, step: TaskExecutionStep): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.executionLog.push(step);

    // 更新当前任务的执行日志
    if (agent.currentTask) {
      if (!agent.currentTask.executionLog) {
        agent.currentTask.executionLog = [];
      }
      agent.currentTask.executionLog.push(step);
    }
  }

  /**
   * 获取执行日志
   */
  getExecutionLog(agentId: string): TaskExecutionStep[] {
    return this.agents.get(agentId)?.executionLog || [];
  }

  // ==================== 事件系统 ====================

  /**
   * 监听事件
   */
  on(eventType: BridgeEventType, callback: (event: BridgeEvent) => void): void {
    this.eventListeners.get(eventType)?.add(callback);
  }

  /**
   * 取消监听
   */
  off(eventType: BridgeEventType, callback: (event: BridgeEvent) => void): void {
    this.eventListeners.get(eventType)?.delete(callback);
  }

  /**
   * 发送事件（public，供外部模块调用）
   */
  emit(event: BridgeEvent): void {
    this.eventListeners.get(event.type)?.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error(`Error in event handler for ${event.type}:`, error);
      }
    });
  }

  // ==================== 工具方法 ====================

  /**
   * 创建新任务 ID
   */
  generateTaskId(): string {
    return `task_${++this.taskIdCounter}_${Date.now()}`;
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): AgentTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): AgentTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 失败任务
   */
  private failTask(taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'FAILED';
      task.error = error;
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    // 取消所有进行中的任务
    this.agents.forEach((agent, agentId) => {
      if (agent.currentTask) {
        this.cancelTask(agentId);
      }
    });

    // 清理事件监听器
    this.eventListeners.forEach(listeners => listeners.clear());

    // 清理所有数据
    this.agents.clear();
    this.tasks.clear();
    this.pendingQuestions.clear();
  }

  // ==================== 用户问题管理 ====================

  /**
   * 设置用户问题回调（供外部调用）
   */
  setupUserQuestionCallback(): void {
    console.log('[AgentBridge] setupUserQuestionCallback called');
    setUserQuestionCallback(async (question) => {
      console.log('[AgentBridge] setUserQuestionCallback invoked with:', question);
      return new Promise((resolve) => {
        const questionId = question.id;
        // 优先使用工具链路传入的 agentId，避免在并发场景下错误回落到 unknown。
        const agentId = question.agentId || this.getCurrentAgentId() || 'unknown';

        const userQuestion: UserQuestion = {
          id: questionId,
          agentId,
          question: question.question,
          options: question.options,
          multiple: question.multiple,
          timestamp: Date.now(),
        };

        console.log('[AgentBridge] Emitting user_question event:', userQuestion);

        // 存储问题和 resolve 函数
        this.pendingQuestions.set(questionId, {
          question: userQuestion,
          resolve,
        });

        // 发送用户问题事件
        this.emit({
          type: 'user_question',
          agentId,
          timestamp: Date.now(),
          data: { question: userQuestion },
        });
        console.log('[AgentBridge] user_question event emitted');
      });
    });
    console.log('[AgentBridge] setupUserQuestionCallback completed');
  }

  /**
   * 获取所有待回答的问题
   */
  getPendingQuestions(): UserQuestion[] {
    return Array.from(this.pendingQuestions.values()).map(item => item.question);
  }

  /**
   * 回答用户问题
   */
  answerQuestion(questionId: string, answer: string | string[]): boolean {
    const pending = this.pendingQuestions.get(questionId);
    if (!pending) return false;

    // 解析 Promise
    pending.resolve(answer);

    // 清理
    this.pendingQuestions.delete(questionId);

    return true;
  }

  /**
   * 设置并行执行回调（供外部调用）
   */
  setupParallelExecutionCallback(): void {
    setParallelExecutionCallback(async (request) => {
      // 创建协作任务
      const task: AgentTask & { subtasks: Array<{ description: string; dependencies: string[] }> } = {
        id: this.generateTaskId(),
        title: 'Parallel Execution Task',
        description: `并行执行 ${request.subtasks.length} 个子任务`,
        status: 'IN_PROGRESS',
        createdAt: Date.now(),
        source: 'AUTO',
        subtasks: request.subtasks,
      };

      return this.executeCollaborativeTask(task, request.executionMode);
    });
  }

  /**
   * 获取当前正在执行任务的 Agent ID
   */
  private getCurrentAgentId(): string | null {
    for (const [agentId, agent] of this.agents) {
      if (agent.isProcessing) {
        return agentId;
      }
    }
    return null;
  }

  // ==================== 并行执行支持 ====================

  /**
   * 并行执行多个任务
   * @param taskIds 任务 ID 数组
   * @param agentIds 分配的 Agent ID 数组（长度必须与 taskIds 相同）
   * @returns 任务 ID 到执行结果的映射
   */
  async executeParallel(taskIds: string[], agentIds: string[]): Promise<Map<string, string>> {
    if (taskIds.length !== agentIds.length) {
      throw new Error('taskIds 和 agentIds 长度必须相同');
    }

    const results = new Map<string, string>();
    const promises: Promise<void>[] = [];

    for (let i = 0; i < taskIds.length; i++) {
      const taskId = taskIds[i];
      const agentId = agentIds[i];
      const task = this.tasks.get(taskId);

      if (!task) {
        throw new Error(`任务不存在: ${taskId}`);
      }

      const agent = this.agents.get(agentId);
      if (!agent) {
        throw new Error(`Agent 不存在: ${agentId}`);
      }

      if (agent.isProcessing) {
        throw new Error(`Agent ${agentId} 正在处理其他任务`);
      }

      // 创建并行执行 Promise
      const promise = this.executeTask(agentId, task)
        .then(result => {
          results.set(taskId, result);
        })
        .catch(error => {
          results.set(taskId, `Error: ${error.message}`);
        });

      promises.push(promise);
    }

    // 等待所有任务完成
    await Promise.all(promises);

    return results;
  }

  /**
   * 创建并执行子任务
   * @param parentAgentId 父 Agent ID
   * @param subtask 子任务描述
   * @returns 子任务 ID
   */
  async spawnSubAgent(parentAgentId: string, subtask: Partial<AgentTask>): Promise<string> {
    const parentAgent = this.agents.get(parentAgentId);
    if (!parentAgent) {
      throw new Error(`父 Agent 不存在: ${parentAgentId}`);
    }

    // 生成子 Agent ID
    const subAgentId = `${parentAgentId}_sub_${Date.now()}`;

    // 创建子任务
    const taskId = this.generateTaskId();
    const task: AgentTask = {
      id: taskId,
      title: subtask.title || 'Sub-task',
      description: subtask.description || '',
      status: 'TODO',
      createdAt: Date.now(),
      source: 'COLLABORATIVE',
      sdkPrompt: subtask.sdkPrompt,
      workingDirectory: subtask.workingDirectory,
    };

    this.tasks.set(taskId, task);

    // 发送事件通知
    this.emit({
      type: 'task_started',
      agentId: subAgentId,
      timestamp: Date.now(),
      data: { task },
    });

    return taskId;
  }

  /**
   * 获取可用的 Agent 列表（不在处理任务的）
   */
  getAvailableAgents(): string[] {
    const available: string[] = [];
    for (const [agentId, agent] of this.agents) {
      if (!agent.isProcessing) {
        available.push(agentId);
      }
    }
    return available;
  }

  /**
   * 执行协作任务（带子任务）
   * @param task 协作任务
   * @param executionMode 执行模式：'sequential' 或 'parallel'
   */
  async executeCollaborativeTask(
    task: AgentTask & { subtasks: Array<{ description: string; dependencies: string[] }> },
    executionMode: 'sequential' | 'parallel' = 'sequential'
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const subtaskIds: string[] = [];
    const assignedAgents: string[] = [];

    // 为每个子任务分配 Agent
    const availableAgents = this.getAvailableAgents();

    if (availableAgents.length < task.subtasks.length) {
      throw new Error(`可用 Agent 不足。需要 ${task.subtasks.length} 个，可用 ${availableAgents.length} 个`);
    }

    // 创建子任务
    for (let i = 0; i < task.subtasks.length; i++) {
      const subtaskDef = task.subtasks[i];
      const agentId = availableAgents[i];

      const subtaskId = await this.spawnSubAgent(agentId, {
        title: `Sub-task ${i + 1}`,
        description: subtaskDef.description,
        sdkPrompt: subtaskDef.description,
        workingDirectory: task.workingDirectory,
      });

      subtaskIds.push(subtaskId);
      assignedAgents.push(agentId);
    }

    if (executionMode === 'parallel') {
      // 并行执行所有子任务
      await this.executeParallel(subtaskIds, assignedAgents);
    } else {
      // 顺序执行子任务（考虑依赖关系）
      for (let i = 0; i < subtaskIds.length; i++) {
        const subtask = task.subtasks[i];

        // 等待依赖完成
        for (const depId of subtask.dependencies) {
          const depIndex = task.subtasks.findIndex(st => st.description === depId);
          if (depIndex >= 0 && depIndex < i) {
            // 依赖已完成，继续
            continue;
          }
        }

        // 执行子任务
        const result = await this.executeTask(assignedAgents[i], this.tasks.get(subtaskIds[i])!);
        results.set(subtaskIds[i], result);
      }
    }

    return results;
  }

  // ==================== Agent 间消息传递 ====================

  /**
   * 发送消息给另一个 Agent
   */
  sendMessage(from: string, to: string, content: string, type: 'request' | 'notification' = 'request'): string {
    return queueSendMessage(from, to, content, type);
  }

  /**
   * 广播消息给所有 Agent
   */
  broadcast(from: string, content: string): string {
    return queueBroadcastMessage(from, content);
  }

  /**
   * 获取 Agent 的消息
   */
  getMessages(agentId: string): AgentMessage[] {
    const queue = getMessageQueue();
    return queue.getMessages(agentId);
  }

  /**
   * 获取并清空 Agent 的消息队列
   */
  receiveMessages(agentId: string): AgentMessage[] {
    const queue = getMessageQueue();
    return queue.receive(agentId);
  }

  /**
   * 获取未读消息数量
   */
  getUnreadCount(agentId: string): number {
    const queue = getMessageQueue();
    return queue.getUnreadCount(agentId);
  }

  // ==================== 共享记忆 ====================

  /**
   * 添加共享记忆
   */
  addSharedMemory(memory: SharedMemory): void {
    const store = getSharedMemory();
    store.add(memory);
  }

  /**
   * 获取相关记忆
   */
  getRelevantMemories(taskDescription: string, maxResults: number = 5): SharedMemory[] {
    const store = getSharedMemory();
    const relevant = store.getRelevant(taskDescription, maxResults);
    return relevant.map(r => r.memory);
  }

  /**
   * 记录任务结果到共享记忆
   */
  recordTaskResult(agentId: string, taskId: string, result: string, success: boolean = true): void {
    const store = getSharedMemory();
    store.add({
      id: '',
      type: success ? 'result' : 'error',
      content: result,
      source: agentId,
      timestamp: Date.now(),
      tags: ['task', taskId, success ? 'success' : 'error'],
      accessCount: 0,
      lastAccess: Date.now(),
      metadata: { taskId },
    });
  }

  // ==================== Agent 类型系统（新架构）===================

  /**
   * 设置 Agent 类型
   */
  setAgentType(agentId: string, agentType: AgentType): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.config.agentType = agentType;
    }
  }

  /**
   * 获取 Agent 类型
   */
  getAgentType(agentId: string): AgentType | undefined {
    return this.agents.get(agentId)?.config.agentType;
  }

  /**
   * 获取所有主 Agent
   */
  getPrimaryAgents(): string[] {
    const primaryAgents: string[] = [];
    for (const [agentId, agent] of this.agents) {
      if (agent.config.agentType === 'primary') {
        primaryAgents.push(agentId);
      }
    }
    return primaryAgents;
  }

  /**
   * 推荐主 Agent 用于任务
   */
  recommendPrimaryAgentsForTask(taskDescription: string, limit: number = 3): string[] {
    const recommendations: Array<{ agentId: string; score: number }> = [];

    for (const [agentId, agent] of this.agents) {
      // 只推荐主 Agent
      if (agent.config.agentType !== 'primary') continue;

      let score = 0.5; // 默认分数

      // 考虑 Agent 当前状态
      if (agent.isProcessing) {
        score *= 0.5;
      }

      recommendations.push({ agentId, score });
    }

    // 排序并返回前 N 个
    recommendations.sort((a, b) => b.score - a.score);
    return recommendations.slice(0, limit).map(r => r.agentId);
  }
}

// ==================== 单例 ====================

let bridgeInstance: AgentBridge | null = null;

/**
 * 获取 AgentBridge 单例
 */
export function getAgentBridge(): AgentBridge {
  if (!bridgeInstance) {
    bridgeInstance = new AgentBridge();
  }
  return bridgeInstance;
}

/**
 * 重置 AgentBridge（用于测试或重新初始化）
 */
export function resetAgentBridge(): void {
  if (bridgeInstance) {
    bridgeInstance.dispose();
  }
  bridgeInstance = new AgentBridge();
}
