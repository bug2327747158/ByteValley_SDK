/**
 * 协作任务进度可视化组件
 *
 * 显示多 Agent 协作任务的执行进度
 */

import React, { useMemo } from 'react';
import { CheckCircle, Clock, AlertCircle, Users, GitBranch, Zap } from 'lucide-react';

// ==================== 类型定义 ====================

export interface SubTaskDisplay {
  id: string;
  description: string;
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  assignedAgent?: string;
  dependencies: string[];
  result?: string;
  error?: string;
}

export interface CollaborationTaskDisplay {
  id: string;
  title: string;
  description: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  subtasks: SubTaskDisplay[];
  executionMode: 'sequential' | 'parallel';
}

export interface AgentDisplay {
  id: string;
  name: string;
  role?: string;
  color: string;
  status: string;
}

interface CollaborationProgressProps {
  task: CollaborationTaskDisplay;
  agents: AgentDisplay[];
  onSubtaskClick?: (subtaskId: string) => void;
  onAgentClick?: (agentId: string) => void;
}

// ==================== 辅助函数 ====================

function getStatusColor(status: SubTaskDisplay['status']): string {
  switch (status) {
    case 'TODO':
      return 'bg-gray-500';
    case 'IN_PROGRESS':
      return 'bg-blue-500';
    case 'COMPLETED':
      return 'bg-emerald-500';
    case 'FAILED':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
}

function getStatusIcon(status: SubTaskDisplay['status']) {
  switch (status) {
    case 'TODO':
      return <Clock className="w-4 h-4" />;
    case 'IN_PROGRESS':
      return <Zap className="w-4 h-4 animate-pulse" />;
    case 'COMPLETED':
      return <CheckCircle className="w-4 h-4" />;
    case 'FAILED':
      return <AlertCircle className="w-4 h-4" />;
    default:
      return <Clock className="w-4 h-4" />;
  }
}

// ==================== 主组件 ====================

export const CollaborationProgress: React.FC<CollaborationProgressProps> = ({
  task,
  agents,
  onSubtaskClick,
  onAgentClick,
}) => {
  // 计算统计信息
  const stats = useMemo(() => {
    const completed = task.subtasks.filter(st => st.status === 'COMPLETED').length;
    const failed = task.subtasks.filter(st => st.status === 'FAILED').length;
    const inProgress = task.subtasks.filter(st => st.status === 'IN_PROGRESS').length;
    const total = task.subtasks.length;
    const progress = total > 0 ? (completed / total) * 100 : 0;

    return { completed, failed, inProgress, total, progress };
  }, [task.subtasks]);

  // 检查依赖关系是否满足
  const canExecuteSubtask = (subtask: SubTaskDisplay): boolean => {
    return subtask.dependencies.every(depId => {
      const dep = task.subtasks.find(st => st.id === depId);
      return dep?.status === 'COMPLETED';
    });
  };

  // 构建执行顺序（用于可视化）
  const executionOrder = useMemo(() => {
    if (task.executionMode === 'parallel') {
      return task.subtasks.map(st => st.id);
    }

    // 顺序模式：按依赖关系排序
    const sorted: string[] = [];
    const visited = new Set<string>();

    function visit(id: string) {
      if (visited.has(id)) return;
      visited.add(id);

      const subtask = task.subtasks.find(st => st.id === id);
      if (subtask) {
        subtask.dependencies.forEach(visit);
        sorted.push(id);
      }
    }

    task.subtasks.forEach(st => visit(st.id));
    return sorted;
  }, [task.subtasks, task.executionMode]);

  return (
    <div className="bg-zinc-900 border-2 border-[#3d251e] rounded-lg p-4 font-mono text-[10px]">
      {/* 标题和统计 */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-[#fef08a]" />
          <h3 className="text-sm font-bold text-[#fef08a]">{task.title}</h3>
        </div>
        <div className="flex items-center gap-3 text-[9px] text-zinc-400">
          <span>{task.executionMode === 'parallel' ? '并行执行' : '顺序执行'}</span>
          <span className="text-[#fef08a]">{stats.progress.toFixed(0)}%</span>
        </div>
      </div>

      {/* 进度条 */}
      <div className="mb-4">
        <div className="flex justify-between text-[9px] text-zinc-500 mb-1">
          <span>进度</span>
          <span>{stats.completed} / {stats.total} 完成</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
            style={{ width: `${stats.progress}%` }}
          />
        </div>
        {stats.failed > 0 && (
          <div className="text-red-400 text-[9px] mt-1">
            {stats.failed} 个子任务失败
          </div>
        )}
      </div>

      {/* Agent 分配概览 */}
      <div className="mb-4 p-2 bg-zinc-800/50 rounded">
        <div className="text-[9px] text-zinc-500 mb-2">参与 Agent</div>
        <div className="flex flex-wrap gap-2">
          {agents.map(agent => {
            const agentSubtasks = task.subtasks.filter(st => st.assignedAgent === agent.id);
            const agentCompleted = agentSubtasks.filter(st => st.status === 'COMPLETED').length;
            return (
              <div
                key={agent.id}
                onClick={() => onAgentClick?.(agent.id)}
                className="flex items-center gap-2 px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 cursor-pointer transition-colors"
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: agent.color }}
                />
                <span className="text-[10px]">{agent.name}</span>
                {agent.role && (
                  <span className="text-[8px] text-zinc-500">({agent.role})</span>
                )}
                <span className="text-[8px] text-zinc-400">
                  {agentCompleted}/{agentSubtasks.length}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 子任务列表（带依赖可视化） */}
      <div className="space-y-2">
        <div className="text-[9px] text-zinc-500 flex items-center gap-1">
          <GitBranch className="w-3 h-3" />
          子任务依赖图
        </div>

        {task.executionMode === 'sequential' ? (
          // 顺序执行模式 - 显示依赖链
          <div className="space-y-1">
            {executionOrder.map((subtaskId, index) => {
              const subtask = task.subtasks.find(st => st.id === subtaskId);
              if (!subtask) return null;

              const canExecute = canExecuteSubtask(subtask);
              const agent = agents.find(a => a.id === subtask.assignedAgent);

              return (
                <div
                  key={subtask.id}
                  onClick={() => onSubtaskClick?.(subtask.id)}
                  className={`
                    flex items-center gap-2 p-2 rounded border-2 transition-all
                    ${!canExecute && subtask.status === 'TODO' ? 'opacity-50' : ''}
                    ${subtask.status === 'IN_PROGRESS' ? 'border-blue-500 bg-blue-900/20' : ''}
                    ${subtask.status === 'COMPLETED' ? 'border-emerald-500 bg-emerald-900/20' : ''}
                    ${subtask.status === 'FAILED' ? 'border-red-500 bg-red-900/20' : ''}
                    ${subtask.status === 'TODO' ? 'border-zinc-700 bg-zinc-800/50' : ''}
                    cursor-pointer
                  `}
                >
                  {/* 序号和状态图标 */}
                  <div className="flex items-center gap-2 text-zinc-500">
                    <span className="text-[8px]">#{index + 1}</span>
                    {getStatusIcon(subtask.status)}
                  </div>

                  {/* 描述 */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] truncate">{subtask.description}</div>
                    {subtask.dependencies.length > 0 && (
                      <div className="text-[8px] text-zinc-500">
                        依赖: {subtask.dependencies.map(d => {
                          const dep = task.subtasks.find(st => st.id === d);
                          return dep?.description.slice(0, 20) || d;
                        }).join(', ')}
                      </div>
                    )}
                  </div>

                  {/* 分配的 Agent */}
                  {agent && (
                    <div
                      className="flex items-center gap-1 px-1 py-0.5 rounded text-[8px]"
                      style={{ backgroundColor: agent.color }}
                    >
                      {agent.name.slice(0, 6)}
                    </div>
                  )}

                  {/* 状态指示器 */}
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(subtask.status)}`} />
                </div>
              );
            })}
          </div>
        ) : (
          // 并行执行模式 - 显示网格
          <div className="grid grid-cols-2 gap-2">
            {task.subtasks.map((subtask, index) => {
              const agent = agents.find(a => a.id === subtask.assignedAgent);

              return (
                <div
                  key={subtask.id}
                  onClick={() => onSubtaskClick?.(subtask.id)}
                  className={`
                    p-2 rounded border-2 transition-all
                    ${subtask.status === 'IN_PROGRESS' ? 'border-blue-500 bg-blue-900/20' : ''}
                    ${subtask.status === 'COMPLETED' ? 'border-emerald-500 bg-emerald-900/20' : ''}
                    ${subtask.status === 'FAILED' ? 'border-red-500 bg-red-900/20' : ''}
                    ${subtask.status === 'TODO' ? 'border-zinc-700 bg-zinc-800/50' : ''}
                    cursor-pointer
                  `}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">{getStatusIcon(subtask.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] text-zinc-500 mb-1">任务 {index + 1}</div>
                      <div className="text-[10px] truncate">{subtask.description}</div>
                      {agent && (
                        <div
                          className="mt-1 inline-flex items-center gap-1 px-1 py-0.5 rounded text-[8px]"
                          style={{ backgroundColor: agent.color }}
                        >
                          {agent.name.slice(0, 8)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 任务结果摘要 */}
      {task.status === 'COMPLETED' && (
        <div className="mt-4 p-3 bg-emerald-900/30 border border-emerald-700 rounded">
          <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-bold mb-1">
            <CheckCircle className="w-4 h-4" />
            协作任务完成
          </div>
          <div className="text-[9px] text-zinc-400">
            所有 {stats.total} 个子任务已完成
          </div>
        </div>
      )}

      {task.status === 'FAILED' && (
        <div className="mt-4 p-3 bg-red-900/30 border border-red-700 rounded">
          <div className="flex items-center gap-2 text-red-400 text-[10px] font-bold mb-1">
            <AlertCircle className="w-4 h-4" />
            协作任务失败
          </div>
          <div className="text-[9px] text-zinc-400">
            {stats.failed} 个子任务失败
          </div>
        </div>
      )}
    </div>
  );
};

export default CollaborationProgress;
