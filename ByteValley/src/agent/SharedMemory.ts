/**
 * 共享记忆系统
 *
 * 支持多 Agent 之间的上下文共享和知识积累
 */

// ==================== 类型定义 ====================

/**
 * 记忆类型
 */
export type MemoryType =
  | 'fact'          // 事实信息
  | 'context'       // 上下文信息
  | 'decision'      // 决策记录
  | 'result'        // 执行结果
  | 'error'         // 错误信息
  | 'observation';  // 观察记录

/**
 * 共享记忆条目
 */
export interface SharedMemory {
  id: string;                    // 唯一 ID
  type: MemoryType;              // 记忆类型
  content: string;               // 内容
  source: string;                // 来源 Agent ID
  timestamp: number;             // 创建时间
  tags: string[];                // 标签（用于搜索）
  accessCount: number;           // 访问次数
  lastAccess: number;            // 最后访问时间
  metadata?: {
    taskId?: string;             // 关联任务 ID
    confidence?: number;         // 置信度 (0-1)
    expiresAt?: number;          // 过期时间
    relatedMemories?: string[];  // 相关记忆 ID
  };
}

/**
 * 记忆搜索选项
 */
export interface MemorySearchOptions {
  types?: MemoryType[];          // 过滤类型
  tags?: string[];               // 匹配标签
  sources?: string[];            // 过滤来源
  since?: number;                // 时间起点
  maxResults?: number;           // 最大结果数
  includeExpired?: boolean;      // 包含过期记忆
}

/**
 * 记忆相关性评分
 */
export interface MemoryRelevance {
  memory: SharedMemory;
  score: number;                 // 相关性分数 (0-1)
  reason: string;                // 相关原因
}

// ==================== 记忆存储 ====================

/**
 * 共享记忆存储
 */
class SharedMemoryStore {
  private memories: Map<string, SharedMemory> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();  // tag -> memoryIds
  private typeIndex: Map<MemoryType, Set<string>> = new Map();  // type -> memoryIds
  private sourceIndex: Map<string, Set<string>> = new Map();  // source -> memoryIds
  private memoryCounter = 0;

  /**
   * 添加记忆
   */
  add(memory: SharedMemory): void {
    // 生成 ID
    if (!memory.id) {
      memory.id = `mem_${++this.memoryCounter}_${Date.now()}`;
    }

    // 初始化访问统计
    memory.accessCount = 0;
    memory.lastAccess = Date.now();

    // 存储记忆
    this.memories.set(memory.id, memory);

    // 更新索引
    this.updateIndexes(memory);

    return;
  }

  /**
   * 批量添加记忆
   */
  addBatch(memories: SharedMemory[]): void {
    memories.forEach(memory => this.add(memory));
  }

  /**
   * 获取记忆
   */
  get(memoryId: string): SharedMemory | undefined {
    const memory = this.memories.get(memoryId);
    if (memory) {
      memory.accessCount++;
      memory.lastAccess = Date.now();
    }
    return memory;
  }

  /**
   * 搜索记忆
   */
  search(query: string, options?: MemorySearchOptions): SharedMemory[] {
    const now = Date.now();
    const results: SharedMemory[] = [];
    const queryLower = query.toLowerCase();

    // 遍历所有记忆
    for (const memory of this.memories.values()) {
      // 检查过期
      if (!options?.includeExpired) {
        const expiresAt = memory.metadata?.expiresAt;
        if (expiresAt && expiresAt < now) continue;
      }

      // 应用过滤条件
      if (options?.types && !options.types.includes(memory.type)) continue;
      if (options?.sources && !options.sources.includes(memory.source)) continue;
      if (options?.since && memory.timestamp < options.since) continue;
      if (options?.tags && !options.tags.some(tag => memory.tags.includes(tag))) continue;

      // 文本匹配
      if (query) {
        const contentMatch = memory.content.toLowerCase().includes(queryLower);
        const tagMatch = memory.tags.some(tag => tag.toLowerCase().includes(queryLower));
        if (!contentMatch && !tagMatch) continue;
      }

      results.push(memory);
    }

    // 按相关性和时间排序
    results.sort((a, b) => {
      // 优先考虑访问频率
      const scoreA = a.accessCount / (now - a.lastAccess + 1);
      const scoreB = b.accessCount / (now - b.lastAccess + 1);
      return scoreB - scoreA;
    });

    // 限制结果数量
    if (options?.maxResults) {
      return results.slice(0, options.maxResults);
    }

    return results;
  }

  /**
   * 获取与任务相关的记忆
   */
  getRelevant(taskDescription: string, maxResults: number = 5): MemoryRelevance[] {
    const now = Date.now();
    const relevant: MemoryRelevance[] = [];
    const taskLower = taskDescription.toLowerCase();
    const taskWords = new Set(taskLower.split(/\s+/).filter(w => w.length > 3));

    for (const memory of this.memories.values()) {
      // 跳过过期记忆
      const expiresAt = memory.metadata?.expiresAt;
      if (expiresAt && expiresAt < now) continue;

      const contentLower = memory.content.toLowerCase();
      let score = 0;
      const reasons: string[] = [];

      // 1. 标签匹配
      const tagMatches = memory.tags.filter(tag =>
        taskWords.has(tag.toLowerCase())
      );
      if (tagMatches.length > 0) {
        score += tagMatches.length * 0.3;
        reasons.push(`Tags match: ${tagMatches.join(', ')}`);
      }

      // 2. 内容关键词匹配
      const contentMatches = Array.from(taskWords).filter(word =>
        contentLower.includes(word)
      );
      if (contentMatches.length > 0) {
        score += contentMatches.length * 0.2;
        reasons.push(`Keywords: ${contentMatches.slice(0, 3).join(', ')}`);
      }

      // 3. 时间衰减（最近的记忆更相关）
      const age = now - memory.timestamp;
      const freshness = Math.max(0, 1 - age / (7 * 24 * 3600000));  // 7天衰减
      score += freshness * 0.2;
      if (freshness > 0.5) {
        reasons.push('Recent');
      }

      // 4. 访问频率（常用的记忆更相关）
      const popularity = Math.min(1, memory.accessCount / 10);
      score += popularity * 0.1;
      if (popularity > 0.5) {
        reasons.push('Frequently accessed');
      }

      // 5. 置信度
      if (memory.metadata?.confidence) {
        score += memory.metadata.confidence * 0.2;
      }

      if (score > 0.3) {
        relevant.push({
          memory,
          score: Math.min(1, score),
          reason: reasons.join(', '),
        });
      }
    }

    // 排序并限制数量
    relevant.sort((a, b) => b.score - a.score);
    return relevant.slice(0, maxResults);
  }

  /**
   * 按标签获取记忆
   */
  getByTag(tag: string): SharedMemory[] {
    const memoryIds = this.tagIndex.get(tag);
    if (!memoryIds) return [];

    return Array.from(memoryIds)
      .map(id => this.memories.get(id))
      .filter((m): m is SharedMemory => m !== undefined);
  }

  /**
   * 按类型获取记忆
   */
  getByType(type: MemoryType): SharedMemory[] {
    const memoryIds = this.typeIndex.get(type);
    if (!memoryIds) return [];

    return Array.from(memoryIds)
      .map(id => this.memories.get(id))
      .filter((m): m is SharedMemory => m !== undefined);
  }

  /**
   * 按来源获取记忆
   */
  getBySource(source: string): SharedMemory[] {
    const memoryIds = this.sourceIndex.get(source);
    if (!memoryIds) return [];

    return Array.from(memoryIds)
      .map(id => this.memories.get(id))
      .filter((m): m is SharedMemory => m !== undefined);
  }

  /**
   * 更新记忆
   */
  update(memoryId: string, updates: Partial<SharedMemory>): boolean {
    const memory = this.memories.get(memoryId);
    if (!memory) return false;

    // 清理旧索引
    this.removeFromIndexes(memory);

    // 更新记忆
    Object.assign(memory, updates);
    memory.lastAccess = Date.now();

    // 更新索引
    this.updateIndexes(memory);

    return true;
  }

  /**
   * 删除记忆
   */
  delete(memoryId: string): boolean {
    const memory = this.memories.get(memoryId);
    if (!memory) return false;

    this.removeFromIndexes(memory);
    this.memories.delete(memoryId);
    return true;
  }

  /**
   * 清理过期记忆
   */
  cleanup(maxAge: number = 7 * 24 * 3600000): number {
    const now = Date.now();
    const cutoff = now - maxAge;
    let deleted = 0;

    for (const [id, memory] of this.memories.entries()) {
      const expiresAt = memory.metadata?.expiresAt || memory.timestamp + maxAge;
      if (expiresAt < now || memory.timestamp < cutoff) {
        this.delete(id);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * 获取所有记忆
   */
  getAll(): SharedMemory[] {
    return Array.from(this.memories.values());
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalMemories: number;
    byType: Record<MemoryType, number>;
    bySource: Record<string, number>;
    topTags: Array<{ tag: string; count: number }>;
  } {
    const byType: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};

    for (const memory of this.memories.values()) {
      // 按类型统计
      byType[memory.type] = (byType[memory.type] || 0) + 1;

      // 按来源统计
      bySource[memory.source] = (bySource[memory.source] || 0) + 1;

      // 标签统计
      for (const tag of memory.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }

    // 排序标签
    const topTags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalMemories: this.memories.size,
      byType: byType as Record<MemoryType, number>,
      bySource,
      topTags,
    };
  }

  /**
   * 清空所有记忆
   */
  clear(): void {
    this.memories.clear();
    this.tagIndex.clear();
    this.typeIndex.clear();
    this.sourceIndex.clear();
  }

  // ==================== 私有方法 ====================

  /**
   * 更新索引
   */
  private updateIndexes(memory: SharedMemory): void {
    // 类型索引
    let typeSet = this.typeIndex.get(memory.type);
    if (!typeSet) {
      typeSet = new Set();
      this.typeIndex.set(memory.type, typeSet);
    }
    typeSet.add(memory.id);

    // 来源索引
    let sourceSet = this.sourceIndex.get(memory.source);
    if (!sourceSet) {
      sourceSet = new Set();
      this.sourceIndex.set(memory.source, sourceSet);
    }
    sourceSet.add(memory.id);

    // 标签索引
    for (const tag of memory.tags) {
      let tagSet = this.tagIndex.get(tag);
      if (!tagSet) {
        tagSet = new Set();
        this.tagIndex.set(tag, tagSet);
      }
      tagSet.add(memory.id);
    }
  }

  /**
   * 从索引中移除
   */
  private removeFromIndexes(memory: SharedMemory): void {
    // 类型索引
    const typeSet = this.typeIndex.get(memory.type);
    typeSet?.delete(memory.id);

    // 来源索引
    const sourceSet = this.sourceIndex.get(memory.source);
    sourceSet?.delete(memory.id);

    // 标签索引
    for (const tag of memory.tags) {
      const tagSet = this.tagIndex.get(tag);
      tagSet?.delete(memory.id);
    }
  }
}

// ==================== 单例 ====================

let sharedMemoryInstance: SharedMemoryStore | null = null;

/**
 * 获取共享记忆单例
 */
export function getSharedMemory(): SharedMemoryStore {
  if (!sharedMemoryInstance) {
    sharedMemoryInstance = new SharedMemoryStore();

    // 定期清理过期记忆（每小时）
    setInterval(() => {
      sharedMemoryInstance?.cleanup();
    }, 3600000);
  }
  return sharedMemoryInstance;
}

/**
 * 重置共享记忆（用于测试）
 */
export function resetSharedMemory(): void {
  sharedMemoryInstance = new SharedMemoryStore();
}

// ==================== 便捷函数 ====================

/**
 * 创建并添加记忆
 */
export function createMemory(
  type: MemoryType,
  content: string,
  source: string,
  tags: string[] = [],
  metadata?: SharedMemory['metadata']
): string {
  const store = getSharedMemory();
  const memory: SharedMemory = {
    id: '',
    type,
    content,
    source,
    timestamp: Date.now(),
    tags,
    accessCount: 0,
    lastAccess: Date.now(),
    metadata,
  };

  store.add(memory);
  return memory.id;
}

/**
 * 记录任务结果
 */
export function recordTaskResult(
  source: string,
  taskId: string,
  result: string,
  success: boolean = true
): string {
  return createMemory(
    success ? 'result' : 'error',
    result,
    source,
    ['task', taskId, success ? 'success' : 'error'],
    { taskId, confidence: 0.9 }
  );
}

/**
 * 记录决策
 */
export function recordDecision(
  source: string,
  decision: string,
  reasoning: string,
  taskId?: string
): string {
  return createMemory(
    'decision',
    `Decision: ${decision}\nReasoning: ${reasoning}`,
    source,
    ['decision', taskId ? `task-${taskId}` : ''],
    { taskId }
  );
}

/**
 * 记录观察
 */
export function recordObservation(
  source: string,
  observation: string,
  tags: string[] = []
): string {
  return createMemory(
    'observation',
    observation,
    source,
    ['observation', ...tags],
    { confidence: 0.7 }
  );
}

/**
 * 查找相关记忆（用于任务执行）
 */
export function findRelevantMemories(
  taskDescription: string,
  maxResults: number = 5
): SharedMemory[] {
  const store = getSharedMemory();
  const relevant = store.getRelevant(taskDescription, maxResults);
  return relevant.map(r => r.memory);
}

/**
 * 格式化记忆为上下文（用于注入到 SDK 提示词）
 */
export function formatMemoriesAsContext(memories: SharedMemory[]): string {
  if (memories.length === 0) {
    return 'No relevant context available.';
  }

  const lines: string[] = ['Relevant context from shared memory:'];

  memories.forEach((memory, index) => {
    lines.push(`${index + 1}. [${memory.type}] ${memory.content}`);
    if (memory.tags.length > 0) {
      lines.push(`   Tags: ${memory.tags.join(', ')}`);
    }
    lines.push(`   Source: ${memory.source} | Access count: ${memory.accessCount}`);
  });

  return lines.join('\n');
}
