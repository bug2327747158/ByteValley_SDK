/**
 * Agent 间消息传递系统
 *
 * 支持 Agent 之间的直接消息、广播和消息队列管理
 */

import { getAgentBridge } from './AgentBridge';
import type { BridgeEvent } from './types';

// ==================== 消息类型定义 ====================

/**
 * Agent 消息类型
 */
export type AgentMessageType =
  | 'request'        // 请求（需要响应）
  | 'response'       // 响应（对请求的回复）
  | 'broadcast'      // 广播（发给所有人）
  | 'status'         // 状态更新
  | 'collaboration'  // 协作邀请
  | 'notification';  // 通知（不需要响应）

/**
 * Agent 间消息
 */
export interface AgentMessage {
  id: string;                    // 唯一消息 ID
  from: string;                  // 发送者 Agent ID
  to: string;                    // 接收者 Agent ID ('*' 表示广播)
  type: AgentMessageType;        // 消息类型
  content: string;               // 消息内容
  timestamp: number;             // 发送时间戳
  replyTo?: string;              // 回复的消息 ID
  metadata?: {
    taskId?: string;             // 关联任务 ID
    urgency?: 'low' | 'normal' | 'high';  // 紧急程度
    expiresAt?: number;          // 过期时间
    data?: any;                  // 附加数据
  };
  status: 'pending' | 'delivered' | 'read' | 'processed';
}

/**
 * 消息发送选项
 */
export interface MessageOptions {
  urgency?: 'low' | 'normal' | 'high';
  ttl?: number;                  // 消息存活时间（毫秒）
  waitForReply?: boolean;        // 是否等待回复
  timeout?: number;              // 等待回复超时（毫秒）
}

// ==================== 消息队列 ====================

/**
 * 消息队列管理器
 */
class MessageQueue {
  private queues = new Map<string, AgentMessage[]>();  // agentId -> messages
  private messageHistory: AgentMessage[] = [];          // 所有消息历史
  private pendingReplies = new Map<string, {
    resolve: (message: AgentMessage) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private messageIdCounter = 0;

  /**
   * 发送消息
   */
  send(message: AgentMessage): void {
    // 添加到发送者历史
    this.messageHistory.push(message);

    // 广播消息
    if (message.to === '*') {
      this.broadcast(message);
      return;
    }

    // 发送给特定 Agent
    let queue = this.queues.get(message.to);
    if (!queue) {
      queue = [];
      this.queues.set(message.to, queue);
    }

    // 更新消息状态
    message.status = 'delivered';
    queue.push(message);

    // 限制队列大小
    if (queue.length > 100) {
      queue.shift();  // 移除最老的消息
    }

    // 触发消息事件
    const bridge = getAgentBridge();
    bridge.emit({
      type: 'message',
      agentId: message.to,
      timestamp: Date.now(),
      data: { content: `Message from ${message.from}: ${message.content}` },
    } as BridgeEvent);
  }

  /**
   * 广播消息给所有 Agent（除了发送者）
   */
  private broadcast(message: AgentMessage): void {
    const bridge = getAgentBridge();
    const allAgents = bridge.getAllAgents();

    for (const agentId of allAgents.keys()) {
      if (agentId !== message.from) {
        const broadcastMsg: AgentMessage = {
          ...message,
          id: this.generateId(),
          to: agentId,
          status: 'delivered',
        };

        let queue = this.queues.get(agentId);
        if (!queue) {
          queue = [];
          this.queues.set(agentId, queue);
        }
        queue.push(broadcastMsg);

        // 触发事件
        bridge.emit({
          type: 'message',
          agentId,
          timestamp: Date.now(),
          data: { content: `Broadcast from ${message.from}: ${message.content}` },
        } as BridgeEvent);
      }
    }
  }

  /**
   * 接收 Agent 的消息
   */
  receive(agentId: string): AgentMessage[] {
    const queue = this.queues.get(agentId);
    if (!queue) return [];

    // 返回并清空队列
    const messages = queue.splice(0);
    messages.forEach(msg => msg.status = 'read');
    return messages;
  }

  /**
   * 获取 Agent 的消息（不移除）
   */
  getMessages(agentId: string): AgentMessage[] {
    return this.queues.get(agentId) || [];
  }

  /**
   * 获取未读消息数量
   */
  getUnreadCount(agentId: string): number {
    return this.queues.get(agentId)?.length || 0;
  }

  /**
   * 标记消息为已处理
   */
  markProcessed(agentId: string, messageId: string): boolean {
    const queue = this.queues.get(agentId);
    if (!queue) return false;

    const message = queue.find(m => m.id === messageId);
    if (message) {
      message.status = 'processed';
      return true;
    }
    return false;
  }

  /**
   * 清空 Agent 的消息队列
   */
  clearQueue(agentId: string): void {
    this.queues.delete(agentId);
  }

  /**
   * 发送消息并等待回复
   */
  async sendAndWaitForReply(
    message: AgentMessage,
    timeout: number = 30000
  ): Promise<AgentMessage> {
    return new Promise((resolve, reject) => {
      // 发送消息
      this.send(message);

      // 设置等待回复
      const timer = setTimeout(() => {
        this.pendingReplies.delete(message.id);
        reject(new Error(`Message ${message.id} timed out waiting for reply`));
      }, timeout);

      this.pendingReplies.set(message.id, {
        resolve,
        reject,
        timeout: timer,
      });
    });
  }

  /**
   * 回复消息
   */
  reply(originalMessage: AgentMessage, content: string): void {
    const reply: AgentMessage = {
      id: this.generateId(),
      from: originalMessage.to,  // 接收者变成发送者
      to: originalMessage.from,  // 发送者变成接收者
      type: 'response',
      content,
      timestamp: Date.now(),
      replyTo: originalMessage.id,
      status: 'delivered',
    };

    this.send(reply);

    // 检查是否有等待的 Promise
    const pending = this.pendingReplies.get(originalMessage.id);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.resolve(reply);
      this.pendingReplies.delete(originalMessage.id);
    }
  }

  /**
   * 获取消息历史
   */
  getHistory(filter?: {
    from?: string;
    to?: string;
    type?: AgentMessageType;
    since?: number;
  }): AgentMessage[] {
    let history = [...this.messageHistory];

    if (filter) {
      if (filter.from) {
        history = history.filter(m => m.from === filter.from);
      }
      if (filter.to) {
        history = history.filter(m => m.to === filter.to);
      }
      if (filter.type) {
        history = history.filter(m => m.type === filter.type);
      }
      if (filter.since) {
        history = history.filter(m => m.timestamp >= filter.since!);
      }
    }

    return history.reverse();  // 最新的在前
  }

  /**
   * 清理过期消息
   */
  cleanup(maxAge: number = 3600000): void {
    const now = Date.now();
    const cutoff = now - maxAge;

    // 清理历史
    this.messageHistory = this.messageHistory.filter(m => m.timestamp > cutoff);

    // 清理队列
    for (const [agentId, queue] of this.queues.entries()) {
      this.queues.set(
        agentId,
        queue.filter(m => {
          // 检查是否过期
          const expiresAt = m.metadata?.expiresAt || m.timestamp + maxAge;
          return expiresAt > now;
        })
      );
    }
  }

  /**
   * 生成唯一消息 ID
   */
  private generateId(): string {
    return `msg_${++this.messageIdCounter}_${Date.now()}`;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalMessages: number;
    queues: number;
    pendingReplies: number;
  } {
    return {
      totalMessages: this.messageHistory.length,
      queues: this.queues.size,
      pendingReplies: this.pendingReplies.size,
    };
  }

  /**
   * 清空所有数据
   */
  clear(): void {
    this.queues.clear();
    this.messageHistory = [];
    this.pendingReplies.forEach(p => clearTimeout(p.timeout));
    this.pendingReplies.clear();
  }
}

// ==================== 单例 ====================

let messageQueueInstance: MessageQueue | null = null;

/**
 * 获取消息队列单例
 */
export function getMessageQueue(): MessageQueue {
  if (!messageQueueInstance) {
    messageQueueInstance = new MessageQueue();

    // 定期清理过期消息
    setInterval(() => {
      messageQueueInstance?.cleanup();
    }, 60000);  // 每分钟清理一次
  }
  return messageQueueInstance;
}

/**
 * 重置消息队列（用于测试）
 */
export function resetMessageQueue(): void {
  if (messageQueueInstance) {
    messageQueueInstance.clear();
  }
  messageQueueInstance = new MessageQueue();
}

// ==================== 便捷函数 ====================

/**
 * 发送消息给特定 Agent
 */
export function sendMessage(
  from: string,
  to: string,
  content: string,
  type: AgentMessageType = 'request',
  options?: MessageOptions
): string {
  const queue = getMessageQueue();
  const message: AgentMessage = {
    id: (queue as any).generateId?.() || `msg_${Date.now()}`,
    from,
    to,
    type,
    content,
    timestamp: Date.now(),
    metadata: {
      urgency: options?.urgency || 'normal',
      expiresAt: options?.ttl ? Date.now() + options.ttl : undefined,
    },
    status: 'pending',
  };

  queue.send(message);
  return message.id;
}

/**
 * 广播消息给所有 Agent
 */
export function broadcastMessage(
  from: string,
  content: string,
  type: AgentMessageType = 'broadcast'
): string {
  const queue = getMessageQueue();
  const message: AgentMessage = {
    id: (queue as any).generateId?.() || `msg_${Date.now()}`,
    from,
    to: '*',
    type,
    content,
    timestamp: Date.now(),
    status: 'pending',
  };

  queue.send(message);
  return message.id;
}

/**
 * 接收 Agent 的消息
 */
export function receiveMessages(agentId: string): AgentMessage[] {
  const queue = getMessageQueue();
  return queue.receive(agentId);
}

/**
 * 获取 Agent 的未读消息
 */
export function getUnreadMessages(agentId: string): AgentMessage[] {
  const queue = getMessageQueue();
  return queue.getMessages(agentId);
}

/**
 * 回复消息
 */
export function replyToMessage(originalMessage: AgentMessage, content: string): void {
  const queue = getMessageQueue();
  queue.reply(originalMessage, content);
}

/**
 * 发送协作邀请
 */
export function sendCollaborationInvite(
  from: string,
  to: string,
  taskDescription: string,
  taskId: string
): string {
  return sendMessage(from, to, taskDescription, 'collaboration', {
    urgency: 'normal',
  });
}

/**
 * 发送状态更新
 */
export function sendStatusUpdate(
  from: string,
  status: string,
  taskId?: string
): string {
  return broadcastMessage(from, status, 'status');
}
