/**
 * Sub-Agent Factory
 *
 * 动态创建子 Agent (Planner, Executor, Tester, Reviewer)
 * 子 Agent 是临时的，任务完成后自动清理
 */

import type { Agent } from './gameIntegration';
import type { AgentType } from './types';
import { AGENT_TYPE_CONFIG } from './types';
import { getAgentBridge } from './AgentBridge';
import { createSDKAgent } from './sdkConfig';

/**
 * 子 Agent 创建选项
 */
export interface SubAgentOptions {
  parentAgent: Agent;
  agentType: 'planner' | 'executor' | 'tester' | 'reviewer';
  taskContext: string;
  position?: {
    x: number;
    y: number;
  };
}

/**
 * 创建子 Agent
 *
 * @param options 子 Agent 创建选项
 * @returns 子 Agent 对象
 */
export async function createSubAgent(
  options: SubAgentOptions
): Promise<Agent & { isTemporary: true; parentAgentId: string }> {
  const { parentAgent, agentType, taskContext, position } = options;
  const config = AGENT_TYPE_CONFIG[agentType];

  // 生成子 Agent ID
  const safeParentId = parentAgent.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const agentId = `sub-${safeParentId}-${agentType}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

  // 计算位置（在主 Agent 附近随机偏移）
  const offsetX = (Math.random() - 0.5) * 100;
  const offsetY = (Math.random() - 0.5) * 100;
  const x = position?.x ?? parentAgent.x + offsetX;
  const y = position?.y ?? parentAgent.y + offsetY;

  console.log(`[SubAgentFactory] Creating ${agentType} sub-agent:`, {
    agentId,
    parentAgentId: parentAgent.id,
    taskContext,
  });

  // 创建游戏 Agent
  const subAgent: Agent & { isTemporary: true; parentAgentId: string; agentType: AgentType } = {
    id: agentId,
    x,
    y,
    targetX: x,
    targetY: y,
    state: 'IDLE',
    message: `${config.icon} ${config.name} ready for: ${taskContext.slice(0, 30)}...`,
    color: config.color,
    facing: 'right',
    speed: 150,
    frame: 0,
    animationVariant: Math.floor(Math.random() * 3),
    overrideMode: undefined,
    overrideTimeout: null,
    isTemporary: true,
    parentAgentId: parentAgent.id,
    agentType,
  };

  // 创建 SDK Agent
  try {
    const sdkAgent = await createSDKAgent({
      agentId,
      agentType,
    });

    // 注册到 Bridge
    const bridge = getAgentBridge();
    bridge.registerAgent(
      {
        id: agentId,
        name: `${config.name} (${parentAgent.id})`,
        apiKey: sdkAgent.config.apiKey,
        model: sdkAgent.config.model,
        agentType,
      },
      sdkAgent
    );

    console.log(`✅ Sub-Agent registered: ${agentId} (${agentType})`);
  } catch (error) {
    console.error(`❌ Failed to create SDK agent for ${agentId}:`, error);
  }

  return subAgent;
}

/**
 * 批量创建子 Agent
 *
 * @param parentAgent 主 Agent
 * @param agentTypes 要创建的子 Agent 类型列表
 * @param taskContext 任务上下文
 * @returns 创建的子 Agent 数组
 */
export async function createSubAgents(
  parentAgent: Agent,
  agentTypes: Array<'planner' | 'executor' | 'tester' | 'reviewer'>,
  taskContext: string
): Promise<Array<Agent & { isTemporary: true; parentAgentId: string }>> {
  const subAgents: Array<Agent & { isTemporary: true; parentAgentId: string }> = [];

  for (const agentType of agentTypes) {
    try {
      const subAgent = await createSubAgent({
        parentAgent,
        agentType,
        taskContext,
      });
      subAgents.push(subAgent);
    } catch (error) {
      console.error(`Failed to create ${agentType} sub-agent:`, error);
    }
  }

  return subAgents;
}

/**
 * 清理子 Agent
 * 从 Bridge 中注销子 Agent
 *
 * @param subAgentIds 要清理的子 Agent ID 列表
 */
export function cleanupSubAgents(subAgentIds: string[]): void {
  const bridge = getAgentBridge();

  for (const agentId of subAgentIds) {
    try {
      bridge.unregisterAgent(agentId);
      console.log(`🗑️ Sub-Agent cleaned up: ${agentId}`);
    } catch (error) {
      console.error(`Failed to cleanup sub-agent ${agentId}:`, error);
    }
  }
}

/**
 * 清理与指定主 Agent 相关的所有子 Agent
 *
 * @param parentAgentId 主 Agent ID
 */
export function cleanupAllSubAgentsForParent(parentAgentId: string): void {
  const bridge = getAgentBridge();
  const allAgents = bridge.getAllAgents();

  const subAgentIds: string[] = [];

  for (const [agentId, agentData] of allAgents) {
    // 检查是否是子 Agent（通过命名约定或属性判断）
    if (
      agentId.startsWith('sub-') &&
      (
        agentId.includes(`-${parentAgentId}-`) ||
        agentData.config.name.includes(`(${parentAgentId})`)
      )
    ) {
      subAgentIds.push(agentId);
    }
  }

  cleanupSubAgents(subAgentIds);
}

/**
 * 检查 Agent 是否是临时子 Agent
 */
export function isTemporarySubAgent(agentId: string): boolean {
  return agentId.startsWith('sub-');
}

/**
 * 从子 Agent ID 中提取其类型
 */
export function extractSubAgentType(agentId: string): 'planner' | 'executor' | 'tester' | 'reviewer' | null {
  const knownTypes = ['planner', 'executor', 'tester', 'reviewer'] as const;
  const parts = agentId.split('-');
  const matched = parts.find((p): p is typeof knownTypes[number] =>
    (knownTypes as readonly string[]).includes(p)
  );
  return matched || null;
}
