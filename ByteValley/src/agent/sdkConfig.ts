/**
 * SDK 配置
 * 主要为 Electron 桌面应用设计，浏览器环境仅用于演示
 */

// ==================== SDK 配置 ====================

export const sdkConfig = {
  // API 配置（从 claude-sdk-project 复用）
  apiKey: '59ad0142e7bb4b00b01a3bdcdc7a08aa.HnsXRASN06cpha48',
  baseURL: 'https://open.bigmodel.cn/api/anthropic',
  model: 'glm-4.7',

  // 超时配置
  timeout: 120000,

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
  sdkConfig.workingDirectory = path;
  if (typeof window !== 'undefined') {
    localStorage.setItem('bytevalley-working-dir', path);
  }
  console.log('[sdkConfig] Working directory updated:', path);
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
 * 创建 SDK Agent 实例
 * 根据环境自动适配配置
 */
export async function createSDKAgent() {
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

  const agent = {
    client,
    config: sdkConfig,

    // 简单查询（无工具）
    async query(prompt: string, options?: { maxTokens?: number }): Promise<string> {
      try {
        const response = await client.messages.create({
          model: sdkConfig.model,
          max_tokens: options?.maxTokens || 4096,
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
      onMessage?: (content: string) => void;
      onToolUse?: (name: string, input: any) => void;
      onToolResult?: (name: string, result: any) => void;
      workingDirectory?: string;  // 任务特定的工作目录
    }): Promise<string> {
      const { DEFAULT_TOOLS, executeTool, getEnvironment } = await import('./tools');
      const toolEnv = getEnvironment();

      // 确定使用的工作目录：优先使用任务指定的目录
      const workingDir = options?.workingDirectory || sdkConfig.workingDirectory;
      console.log('[SDK Agent] run() with working directory:', workingDir);
      console.log('[SDK Agent] Available tools:', DEFAULT_TOOLS.map(t => t.name));

      const messages: any[] = [{ role: 'user', content: prompt }];
      let finalResponse = '';

      while (true) {
        console.log('[SDK Agent] Sending API request...');
        const response = await client.messages.create({
          model: sdkConfig.model,
          max_tokens: options?.maxTokens || 8192,
          tools: DEFAULT_TOOLS.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema,
          })),
          messages,
        });

        console.log('[SDK Agent] Got response, content blocks:', response.content.length);
        let hasToolUse = false;

        for (const block of response.content) {
          if (block.type === 'text') {
            finalResponse = block.text;
            console.log('[SDK Agent] Text response length:', block.text.length);
            options?.onMessage?.(block.text);
          } else if (block.type === 'tool_use') {
            hasToolUse = true;
            console.log('[SDK Agent] Tool use requested:', block.name, block.input);
            options?.onToolUse?.(block.name, block.input);

            // 执行工具（使用确定的工作目录）
            const result = await executeTool(block.name, block.input, workingDir);
            console.log('[SDK Agent] Tool result:', result.success ? 'Success' : 'Failed', result);
            options?.onToolResult?.(block.name, result);

            messages.push({ role: 'assistant', content: [block] });
            messages.push({
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: block.id,
                content: result.error || result.content || '',
              }],
            });
          }
        }

        if (!hasToolUse) {
          console.log('[SDK Agent] No tool use, returning final response');
          return finalResponse;
        }
      }
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
    workingDirectory: sdkConfig.workingDirectory,
  };
}
