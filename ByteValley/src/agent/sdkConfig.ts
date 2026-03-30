/**
 * SDK 配置
 * 主要为 Electron 桌面应用设计，浏览器环境仅用于演示
 */

import type { AgentType } from './types';
import { AGENT_TYPE_CONFIG } from './types';
import { getSharedMemory, formatMemoriesAsContext } from './SharedMemory';

// ==================== 常量配置 ====================

const MAX_MESSAGES = 20;
const MAX_TOOL_RESULT_CHARS = 6000;
const SDK_CONFIG_STORAGE_KEY = 'bytevalley-sdk-config';

const DEFAULT_API_KEY = '59ad0142e7bb4b00b01a3bdcdc7a08aa.HnsXRASN06cpha48';
const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/anthropic';
const DEFAULT_MODEL = 'glm-4.7';
const DEFAULT_TIMEOUT = 120000;
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_MAX_STEPS = 10;

interface PersistedSDKSettings {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  timeout?: number;
  maxTokens?: number;
  maxSteps?: number;
}

/**
 * 裁剪消息历史，避免 token 爆炸
 */
function trimMessages(messages: any[], maxMessages: number = MAX_MESSAGES): void {
  if (messages.length > maxMessages) {
    // 保留最近的 maxMessages 条消息
    messages.splice(0, messages.length - maxMessages);
  }
}

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function normalizeToolResultContent(raw: any): string {
  const text = String(raw ?? '');
  const clean = stripAnsi(text).trim();
  if (clean.length <= MAX_TOOL_RESULT_CHARS) {
    return clean;
  }
  const omitted = clean.length - MAX_TOOL_RESULT_CHARS;
  return `${clean.slice(0, MAX_TOOL_RESULT_CHARS)}\n...[truncated ${omitted} chars]`;
}

// ==================== SDK 配置 ====================

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function loadPersistedSDKSettings(): PersistedSDKSettings {
  if (typeof window === 'undefined') return {};

  try {
    const raw = localStorage.getItem(SDK_CONFIG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedSDKSettings;

    return {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : undefined,
      baseURL: typeof parsed.baseURL === 'string' ? parsed.baseURL : undefined,
      model: typeof parsed.model === 'string' ? parsed.model : undefined,
      timeout: normalizeInteger(parsed.timeout, DEFAULT_TIMEOUT, 1000, 600000),
      maxTokens: normalizeInteger(parsed.maxTokens, DEFAULT_MAX_TOKENS, 256, 128000),
      maxSteps: normalizeInteger(parsed.maxSteps, DEFAULT_MAX_STEPS, 1, 100),
    };
  } catch (error) {
    console.warn('[sdkConfig] Failed to parse persisted SDK config:', error);
    return {};
  }
}

function persistSDKSettings(): void {
  if (typeof window === 'undefined') return;

  const settings: PersistedSDKSettings = {
    apiKey: sdkConfig.apiKey,
    baseURL: sdkConfig.baseURL,
    model: sdkConfig.model,
    timeout: sdkConfig.timeout,
    maxTokens: sdkConfig.maxTokens,
    maxSteps: sdkConfig.maxSteps,
  };

  try {
    localStorage.setItem(SDK_CONFIG_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('[sdkConfig] Failed to persist SDK config:', error);
  }
}

const persistedSettings = loadPersistedSDKSettings();

export const sdkConfig = {
  // API 配置（从 claude-sdk-project 复用）
  apiKey: persistedSettings.apiKey ?? DEFAULT_API_KEY,
  baseURL: persistedSettings.baseURL ?? DEFAULT_BASE_URL,
  model: persistedSettings.model ?? DEFAULT_MODEL,

  // 超时配置
  timeout: persistedSettings.timeout ?? DEFAULT_TIMEOUT,
  maxTokens: persistedSettings.maxTokens ?? DEFAULT_MAX_TOKENS,
  maxSteps: persistedSettings.maxSteps ?? DEFAULT_MAX_STEPS,

  // 工作目录（SDK 工具操作的基础目录）
  // 可以通过 setWorkingDirectory() 动态更新
  workingDirectory: getDefaultWorkingDirectory(),
};

/**
 * 获取默认工作目录
 */
function getDefaultWorkingDirectory(): string {
  // 从 localStorage 读取保存的目录
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('bytevalley-working-dir');
    if (saved) return saved;
  }

  // 根据平台返回默认路径
  if (typeof process !== 'undefined' && process.platform === 'win32') {
    return 'D:\\work_data\\claude_workspace\\ByteValley';
  }
  return '/mnt/d/work_data/claude_workspace/ByteValley';
}

/**
 * 设置工作目录
 */
export function setWorkingDirectory(path: string): void {
  sdkConfig.workingDirectory = path.trim();
  if (typeof window !== 'undefined') {
    localStorage.setItem('bytevalley-working-dir', sdkConfig.workingDirectory);
  }
  console.log('[sdkConfig] Working directory updated:', sdkConfig.workingDirectory);
}

export interface SDKConfigUpdate {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  timeout?: number;
  maxTokens?: number;
  maxSteps?: number;
}

export interface SDKConnectivityTestInput {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  timeout?: number;
}

export interface SDKConnectivityTestResult {
  success: boolean;
  message: string;
  latencyMs: number;
  baseURL: string;
  model: string;
  responsePreview?: string;
  errorCode?: string;
}

/**
 * 更新运行时 SDK 配置（会持久化到 localStorage）
 */
export function updateSDKConfig(update: SDKConfigUpdate): void {
  if (typeof update.apiKey === 'string') {
    sdkConfig.apiKey = update.apiKey.trim();
  }

  if (typeof update.baseURL === 'string') {
    sdkConfig.baseURL = update.baseURL.trim();
  }

  if (typeof update.model === 'string') {
    sdkConfig.model = update.model.trim();
  }

  if (update.timeout !== undefined) {
    sdkConfig.timeout = normalizeInteger(update.timeout, sdkConfig.timeout, 1000, 600000);
  }

  if (update.maxTokens !== undefined) {
    sdkConfig.maxTokens = normalizeInteger(update.maxTokens, sdkConfig.maxTokens, 256, 128000);
  }

  if (update.maxSteps !== undefined) {
    sdkConfig.maxSteps = normalizeInteger(update.maxSteps, sdkConfig.maxSteps, 1, 100);
  }

  persistSDKSettings();
  console.log('[sdkConfig] Runtime config updated:', {
    baseURL: sdkConfig.baseURL,
    model: sdkConfig.model,
    timeout: sdkConfig.timeout,
    maxTokens: sdkConfig.maxTokens,
    maxSteps: sdkConfig.maxSteps,
    hasApiKey: Boolean(sdkConfig.apiKey),
  });
}

/**
 * 使用指定配置进行连通性测试（不修改全局配置）
 */
export async function testSDKConnectivity(input?: SDKConnectivityTestInput): Promise<SDKConnectivityTestResult> {
  const apiKey = (input?.apiKey ?? sdkConfig.apiKey ?? '').trim();
  const baseURL = (input?.baseURL ?? sdkConfig.baseURL ?? '').trim();
  const model = (input?.model ?? sdkConfig.model ?? '').trim();
  const timeout = normalizeInteger(input?.timeout, sdkConfig.timeout, 1000, 600000);

  if (!apiKey) {
    return {
      success: false,
      message: 'API Key 不能为空',
      latencyMs: 0,
      baseURL,
      model,
    };
  }

  if (!baseURL) {
    return {
      success: false,
      message: 'Base URL 不能为空',
      latencyMs: 0,
      baseURL,
      model,
    };
  }

  if (!model) {
    return {
      success: false,
      message: 'Model 不能为空',
      latencyMs: 0,
      baseURL,
      model,
    };
  }

  const startedAt = Date.now();
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const env = getEnvironment();

    const clientConfig: any = {
      baseURL,
      apiKey,
      timeout,
      maxRetries: 0,
    };

    if (env === 'browser' || env === 'electron') {
      clientConfig.dangerouslyAllowBrowser = true;
    }

    const client = new Anthropic(clientConfig);

    const response = await client.messages.create({
      model,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with "pong".' }],
    });

    const latencyMs = Date.now() - startedAt;
    const responseText = response.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n')
      .trim();

    return {
      success: true,
      message: `连接成功（${latencyMs}ms）`,
      latencyMs,
      baseURL,
      model,
      responsePreview: responseText ? responseText.slice(0, 120) : undefined,
    };
  } catch (error: any) {
    const latencyMs = Date.now() - startedAt;
    const providerMessage = error?.error?.message;
    const fallbackMessage = error?.message;
    const detail = String(providerMessage || fallbackMessage || 'Unknown error');
    const errorCode = error?.error?.code ? String(error.error.code) : undefined;

    return {
      success: false,
      message: `连接失败：${detail}`,
      latencyMs,
      baseURL,
      model,
      errorCode,
    };
  }
}

/**
 * 获取当前工作目录
 */
export function getWorkingDirectory(): string {
  return sdkConfig.workingDirectory;
}

/**
 * 检测运行环境
 */
export function getEnvironment(): 'electron' | 'browser' {
  console.log('[getEnvironment] Checking environment...', {
    hasProcess: typeof process !== 'undefined',
    hasWindow: typeof window !== 'undefined',
    processType: process?.type,
    processVersions: process?.versions,
    windowIsElectron: (window as any)?.isElectron,
    windowProcessType: (window as any)?.processType,
  });

  // 首先检查 preload.js 注入的标记
  if (typeof window !== 'undefined' && (window as any).isElectron) {
    console.log('[getEnvironment] Detected Electron via window.isElectron');
    return 'electron';
  }

  // 在 Electron 中检查 process 对象
  if (typeof process !== 'undefined') {
    // 检查 process.versions.electron（主进程）
    if (process.versions && process.versions.electron) {
      console.log('[getEnvironment] Detected Electron via process.versions.electron');
      return 'electron';
    }
    // 检查 process.type（渲染进程中为 'renderer'）
    if ((process as any).type === 'renderer') {
      console.log('[getEnvironment] Detected Electron via process.type === "renderer"');
      return 'electron';
    }
  }

  // 检查 window 上的 process 信息
  if (typeof window !== 'undefined') {
    const winProcess = (window as any).process;
    if (winProcess?.type === 'renderer') {
      console.log('[getEnvironment] Detected Electron via window.process.type');
      return 'electron';
    }
  }

  console.log('[getEnvironment] Fallback to browser environment');
  return 'browser';
}

// ==================== 创建 SDK Agent ====================

/**
 * 创建 SDK Agent 实例配置
 */
export interface SDKAgentOptions {
  agentType?: AgentType;
  agentId?: string;
  useSharedMemory?: boolean;
}

/**
 * 创建 SDK Agent 实例
 * 根据环境自动适配配置
 */
export async function createSDKAgent(options?: SDKAgentOptions) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const env = getEnvironment();

  console.log('[createSDKAgent] Environment:', env);

  // 基础配置
  const clientConfig: any = {
    baseURL: sdkConfig.baseURL,
    apiKey: sdkConfig.apiKey,
    maxRetries: 2,
    timeout: sdkConfig.timeout,
  };

  // Electron 渲染进程和浏览器环境都需要 dangerouslyAllowBrowser
  // 因为它们都运行在类似浏览器的 JavaScript 环境中
  if (env === 'browser') {
    console.warn('[SDK] Running in browser mode - tools will return simulated data');
    clientConfig.dangerouslyAllowBrowser = true;
  } else if (env === 'electron') {
    console.log('[SDK] Running in Electron mode - full file system access available');
    // Electron 渲染进程也需要设置此选项，因为它仍然运行在浏览器环境中
    clientConfig.dangerouslyAllowBrowser = true;
  }

  const client = new Anthropic(clientConfig);

  // 获取 Agent 类型配置
  const agentType = options?.agentType || 'primary';
  const typeConfig = AGENT_TYPE_CONFIG[agentType];
  const agentId = options?.agentId || 'unknown';

  const agent = {
    client,
    config: sdkConfig,
    agentType,
    agentId: options?.agentId,

    // 构建系统提示词（包含 Agent 类型信息）
    buildSystemPrompt(basePrompt?: string): string {
      let systemPrompt = '';

      // 添加类型系统提示词
      if (typeConfig?.systemPrompt) {
        systemPrompt += typeConfig.systemPrompt + '\n\n';
      }

      // 添加基础提示词
      if (basePrompt) {
        systemPrompt += basePrompt + '\n\n';
      }

      // 添加协作提示（仅对主 Agent）
      if (agentType === 'primary') {
        systemPrompt += `You are a Primary Agent in a multi-agent environment.
- You can coordinate specialized sub-agents (Planner, Executor, Tester, Reviewer)
- You have access to shared memory for context
- Be clear and concise in your communication
- Delegate tasks to appropriate sub-agents when needed

Agent ID: ${agentId}
Type: Primary Agent
`;
      } else {
        systemPrompt += `You are a specialized sub-agent in a multi-agent system.
- Focus on your specific expertise (${typeConfig.name})
- Communicate results clearly to the Primary Agent
- Use available tools to complete your assigned tasks
- Do not make decisions outside your scope

Agent ID: ${agentId}
Type: ${typeConfig.name}
Parent: Primary Agent
`;
      }

      return systemPrompt;
    },

    // 简单查询（无工具）
    async query(prompt: string, options?: { maxTokens?: number }): Promise<string> {
      try {
        const response = await client.messages.create({
          model: sdkConfig.model,
          max_tokens: options?.maxTokens || sdkConfig.maxTokens,
          messages: [{ role: 'user', content: prompt }],
        });

        const textBlocks = response.content.filter((block: any) => block.type === 'text');
        return textBlocks.map((block: any) => block.text).join('\n');
      } catch (error: any) {
        console.error('SDK query error:', error);
        throw error;
      }
    },

    // 运行带工具的对话
    async run(prompt: string, options?: {
      maxTokens?: number;
      maxSteps?: number;
      onMessage?: (content: string) => void;
      onToolUse?: (name: string, input: any) => void;
      onToolResult?: (name: string, result: any) => void;
      workingDirectory?: string;  // 任务特定的工作目录
      onToolStart?: (name: string, input: any) => void;
      onLoopStep?: (step: number, toolCount: number) => void;
      useSharedMemory?: boolean;  // 是否使用共享记忆
    }): Promise<string> {
      const { DEFAULT_TOOLS, executeTool, getEnvironment } = await import('./tools');
      const toolEnv = getEnvironment();

      // 确定使用的工作目录：优先使用任务指定的目录
      const workingDir = options?.workingDirectory || sdkConfig.workingDirectory;
      console.log('[SDK Agent] run() with working directory:', workingDir);
      console.log('[SDK Agent] Available tools:', DEFAULT_TOOLS.map(t => t.name));

      // 构建增强的提示词（包含共享记忆）
      let enhancedPrompt = prompt;
      if (options?.useSharedMemory !== false) {
        const relevantMemories = getSharedMemory().getRelevant(prompt, 3);
        if (relevantMemories.length > 0) {
          const context = formatMemoriesAsContext(relevantMemories.map(r => r.memory));
          enhancedPrompt = `${context}\n\nCurrent task: ${prompt}`;
        }
      }

      // 添加 Agent 类型系统提示词
      const systemPrompt = this.buildSystemPrompt();

      const messages: any[] = [
        { role: 'user', content: enhancedPrompt }
      ];
      let finalResponse = '';
      let step = 0;
      const maxSteps = normalizeInteger(options?.maxSteps, sdkConfig.maxSteps, 1, 100);

      while (step < maxSteps) {
        step++;
        console.log('[SDK Agent] Step', step, '/', maxSteps);
        console.log('[SDK Agent] Sending API request...');

        const response = await client.messages.create({
          model: sdkConfig.model,
          max_tokens: options?.maxTokens || sdkConfig.maxTokens,
          system: systemPrompt,  // 添加系统提示词
          tools: DEFAULT_TOOLS.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema,
          })),
          messages,
        });

        console.log('[SDK Agent] Got response, content blocks:', response.content.length);

        // 收集所有 tool_use blocks
        const toolUses: any[] = [];
        for (const block of response.content) {
          if (block.type === 'text') {
            finalResponse = block.text;
            console.log('[SDK Agent] Text response length:', block.text.length);
            options?.onMessage?.(block.text);
          } else if (block.type === 'tool_use') {
            toolUses.push(block);
          }
        }

        // 没有工具调用，返回结果
        if (toolUses.length === 0) {
          console.log('[SDK Agent] No tool use, returning final response');
          return finalResponse;
        }

        console.log('[SDK Agent] Executing', toolUses.length, 'tools in parallel');
        options?.onLoopStep?.(step, toolUses.length);

        // 并行执行所有工具
        const results = await Promise.all(
          toolUses.map(async (block) => {
            console.log('[SDK Agent] Tool use requested:', block.name, block.input);
            options?.onToolStart?.(block.name, block.input);
            options?.onToolUse?.(block.name, block.input);

            // 执行工具（使用确定的工作目录）
            const result = await executeTool(block.name, block.input, workingDir);
            console.log('[SDK Agent] Tool result:', result.success ? 'Success' : 'Failed', result);
            options?.onToolResult?.(block.name, result);

            return { id: block.id, result };
          })
        );

        // 按 Anthropic 标准格式回填：
        // 1) assistant 原始 tool_use 响应（保留完整 content 顺序）
        // 2) user 的 tool_result 列表（一次性提交）
        messages.push({ role: 'assistant', content: response.content });
        messages.push({
          role: 'user',
          content: results.map(item => ({
            type: 'tool_result',
            tool_use_id: item.id,
            content: normalizeToolResultContent(
              item.result.error || item.result.content || ''
            ),
          })),
        });

        // 裁剪消息历史
        trimMessages(messages);
        console.log('[SDK Agent] Messages after trim:', messages.length);
      }

      console.error('[SDK Agent] Exceeded max steps:', maxSteps);
      throw new Error(`Agent loop exceeded max steps (${maxSteps})`);
    },
  };

  return agent;
}

/**
 * 获取配置信息（用于调试）
 */
export function getConfigInfo() {
  return {
    baseURL: sdkConfig.baseURL,
    model: sdkConfig.model,
    hasApiKey: !!sdkConfig.apiKey,
    timeout: sdkConfig.timeout,
    maxTokens: sdkConfig.maxTokens,
    maxSteps: sdkConfig.maxSteps,
    workingDirectory: sdkConfig.workingDirectory,
  };
}
