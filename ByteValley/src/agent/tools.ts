/**
 * SDK 内置工具定义（Electron 版本）
 *
 * 在 Electron 环境中，可以直接使用 Node.js 的 fs 模块进行文件操作
 */

// 注意：Node.js 模块在函数内部动态导入，避免 Vite 浏览器兼容性检查

// ==================== 工具定义 ====================

export interface Tool {
  name: string;
  description: string;
  inputSchema: any;
}

export const DEFAULT_TOOLS: Tool[] = [
  {
    name: 'read_file',
    description: '读取文件内容',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: '创建新文件并写入内容（仅限新文件，不允许覆盖现有文件）',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '文件内容' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: '编辑文件（替换指定的文本）',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        oldText: { type: 'string', description: '要替换的文本' },
        newText: { type: 'string', description: '新文本' },
      },
      required: ['path', 'oldText', 'newText'],
    },
  },
  {
    name: 'apply_patch',
    description: '应用统一 diff 补丁到文件（推荐用于修改现有文件）',
    inputSchema: {
      type: 'object',
      properties: {
        patch: { type: 'string', description: '统一 diff 格式补丁内容' },
      },
      required: ['patch'],
    },
  },
  {
    name: 'list_files',
    description: '列出目录中的文件和文件夹',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录路径（默认当前目录）' },
      },
      required: [],
    },
  },
  {
    name: 'run_command',
    description: '执行终端命令',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的命令' },
        timeoutMs: { type: 'number', description: '命令超时时间（毫秒，可选，默认 60000）' },
      },
      required: ['command'],
    },
  },
  {
    name: 'search_files',
    description: '在文件中搜索文本内容',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '搜索路径' },
        pattern: { type: 'string', description: '搜索模式（支持正则表达式）' },
      },
      required: ['path', 'pattern'],
    },
  },
  {
    name: 'glob_files',
    description: '使用通配符模式匹配文件（如 *.ts, **/*.tsx, src/**/*.tsx）',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '文件模式，支持 * 和 ** 通配符' },
        path: { type: 'string', description: '搜索路径（可选，默认当前目录）' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'ask_user_question',
    description: '向用户提问获取信息或确认',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '要问用户的问题' },
        options: { type: 'array', items: { type: 'string' }, description: '可选答案列表' },
        multiple: { type: 'boolean', description: '是否允许多选（默认 false）' },
      },
      required: ['question'],
    },
  },
  {
    name: 'create_plan',
    description: '将复杂任务分解为多个步骤，需要用户确认后执行',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: '要分解的任务描述' },
        maxSteps: { type: 'number', description: '最多分解步骤数（默认 5）' },
      },
      required: ['task'],
    },
  },
  {
    name: 'execute_parallel',
    description: '并行执行多个子任务，使用多个 Agent 同时工作',
    inputSchema: {
      type: 'object',
      properties: {
        subtasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string', description: '子任务描述' },
              dependencies: { type: 'array', items: { type: 'string' }, description: '依赖的其他子任务描述' },
            },
            required: ['description'],
          },
        },
        executionMode: { type: 'string', enum: ['sequential', 'parallel'], description: '执行模式（默认 parallel）' },
      },
      required: ['subtasks'],
    },
  },
];

// ==================== 工具执行 ====================

export interface ToolResult {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * 检测运行环境
 */
export function getEnvironment(): 'electron' | 'browser' {
  // 首先检查 preload.js 注入的标记
  if (typeof window !== 'undefined' && (window as any).isElectron) {
    return 'electron';
  }

  // 在 Electron 中检查 process 对象
  if (typeof process !== 'undefined') {
    // 检查 process.versions.electron（主进程）
    if (process.versions && process.versions.electron) {
      return 'electron';
    }
    // 检查 process.type（渲染进程中为 'renderer'）
    if ((process as any).type === 'renderer') {
      return 'electron';
    }
  }

  // 检查 window 上的 process 信息
  if (typeof window !== 'undefined') {
    const winProcess = (window as any).process;
    if (winProcess?.type === 'renderer') {
      return 'electron';
    }
  }

  return 'browser';
}

/**
 * 执行工具操作
 * 自动根据环境选择真实或模拟执行
 */
export async function executeTool(
  name: string,
  input: any,
  cwd?: string
): Promise<ToolResult> {
  const env = getEnvironment();

  console.log('[executeTool] Tool execution:', { name, input, cwd, env });

  if (env === 'electron') {
    // Electron 环境：真实的文件和命令操作
    console.log('[executeTool] Using Electron real file operations');
    return executeToolElectron(name, input, cwd);
  } else {
    console.log('[executeTool] Using browser simulated data');
    // 浏览器环境：返回模拟数据
    return executeToolBrowser(name, input);
  }
}

/**
 * Electron 环境的工具执行（真实文件操作）
 * 使用动态导入避免 Vite 浏览器兼容性检查
 */
async function executeToolElectron(
  name: string,
  input: any,
  cwd?: string
): Promise<ToolResult> {
  try {
    // 默认工作目录
    const defaultWorkingDir = (
      typeof process !== 'undefined' && process.platform === 'win32'
        ? 'D:\\work_data\\claude_workspace\\ByteValley'
        : '/mnt/d/work_data/claude_workspace/ByteValley'
    );
    const workingDir = cwd || defaultWorkingDir;

    console.log('[executeToolElectron] Executing in Electron:', { name, input, workingDir });

    // 使用 require() 而不是动态 import，避免 Vite 外部化 Node.js 模块
    // @ts-ignore - Electron 环境中有 require
    const fs = require('fs');
    // @ts-ignore - Electron 环境中有 require
    const { exec, execSync, execFile } = require('child_process');
    // @ts-ignore - Electron 环境中有 require
    const { resolve: pathResolve } = require('path');

    console.log('[executeToolElectron] Node.js modules loaded successfully');

    switch (name) {
      case 'read_file': {
        const fullPath = pathResolve(workingDir, input.path);
        console.log('[executeToolElectron] Reading file:', fullPath);
        if (!fs.existsSync(fullPath)) {
          return { success: false, error: `文件不存在: ${input.path}` };
        }
        const content = fs.readFileSync(fullPath, 'utf-8');
        console.log('[executeToolElectron] File read success, size:', content.length);
        return { success: true, content };
      }

      case 'write_file': {
        const fullPath = pathResolve(workingDir, input.path);
        if (fs.existsSync(fullPath)) {
          return {
            success: false,
            error: `文件已存在，禁止全量覆盖: ${input.path}。请使用 apply_patch 或 edit_file。`,
          };
        }
        fs.writeFileSync(fullPath, input.content, 'utf-8');
        return { success: true, content: `文件已写入: ${input.path}` };
      }

      case 'edit_file': {
        const fullPath = pathResolve(workingDir, input.path);
        if (!fs.existsSync(fullPath)) {
          return { success: false, error: `文件不存在: ${input.path}` };
        }
        let content = fs.readFileSync(fullPath, 'utf-8');
        if (!content.includes(input.oldText)) {
          return { success: false, error: '未找到要替换的文本' };
        }
        content = content.replace(input.oldText, input.newText);
        fs.writeFileSync(fullPath, content, 'utf-8');
        return { success: true, content: `文件已编辑: ${input.path}` };
      }

      case 'apply_patch': {
        const patch = String(input.patch || '');
        if (!patch.trim()) {
          return { success: false, error: '补丁内容为空' };
        }

        // 优先使用 git apply，失败后尝试 patch 命令（如果系统可用）
        try {
          execSync('git apply --whitespace=nowarn -', {
            cwd: workingDir,
            input: patch,
            encoding: 'utf-8',
          });
          return { success: true, content: '补丁已应用（git apply）' };
        } catch (gitError: any) {
          try {
            execSync('patch -p0 --forward --silent', {
              cwd: workingDir,
              input: patch,
              encoding: 'utf-8',
            });
            return { success: true, content: '补丁已应用（patch）' };
          } catch (patchError: any) {
            return {
              success: false,
              error: `apply_patch 失败: ${gitError.message || patchError.message}`,
            };
          }
        }
      }

      case 'list_files': {
        const targetPath = pathResolve(workingDir, input.path || '.');
        if (!fs.existsSync(targetPath)) {
          return { success: false, error: `目录不存在: ${input.path || '.'}` };
        }
        const entries = fs.readdirSync(targetPath, { withFileTypes: true });
        const files = entries
          .map((e: any) => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`)
          .join('\n');
        return { success: true, content: files || '(空目录)' };
      }

      case 'run_command': {
        const isWindows = typeof process !== 'undefined' && process.platform === 'win32';
        const timeoutMs = Math.min(
          Math.max(Number(input.timeoutMs) || 60000, 1000),
          300000
        );
        const maxBuffer = 10 * 1024 * 1024;

        const runExecFile = (
          file: string,
          args: string[]
        ): Promise<{ stdout: string; stderr: string }> => {
          return new Promise((resolve, reject) => {
            execFile(
              file,
              args,
              {
                cwd: workingDir,
                encoding: 'utf-8',
                maxBuffer,
                timeout: timeoutMs,
                windowsHide: true,
              },
              (error: any, stdout: string, stderr: string) => {
                if (error) {
                  error.stdout = stdout;
                  error.stderr = stderr;
                  reject(error);
                  return;
                }
                resolve({ stdout, stderr });
              }
            );
          });
        };

        const runExec = (
          command: string
        ): Promise<{ stdout: string; stderr: string }> => {
          return new Promise((resolve, reject) => {
            exec(
              command,
              {
                cwd: workingDir,
                encoding: 'utf-8',
                maxBuffer,
                timeout: timeoutMs,
              },
              (error: any, stdout: string, stderr: string) => {
                if (error) {
                  error.stdout = stdout;
                  error.stderr = stderr;
                  reject(error);
                  return;
                }
                resolve({ stdout, stderr });
              }
            );
          });
        };

        try {
          let stdout = '';
          let stderr = '';

          if (isWindows) {
            // 在 Windows 上统一使用 PowerShell，兼容 `cat`/`ls` 等常见别名
            // 并强制 UTF-8 输出，避免中文乱码。
            const result = await runExecFile(
              'powershell',
              [
                '-NoProfile',
                '-ExecutionPolicy',
                'Bypass',
                '-Command',
                `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); ${input.command}`,
              ]
            );
            stdout = result.stdout || '';
            stderr = result.stderr || '';
          } else {
            const result = await runExec(input.command);
            stdout = result.stdout || '';
            stderr = result.stderr || '';
          }

          const merged = `${stdout}${stderr ? `\n${stderr}` : ''}`.trim();
          return { success: true, content: merged || '(command completed with no output)' };
        } catch (error: any) {
          const stdout = error?.stdout || '';
          const stderr = error?.stderr || '';
          const timedOut = error?.killed || error?.signal === 'SIGTERM' || error?.code === 'ETIMEDOUT';
          const reason = timedOut
            ? `Command timed out after ${timeoutMs}ms`
            : (error?.message || 'Command execution failed');
          const details = `${stdout}${stderr ? `\n${stderr}` : ''}`.trim();
          return {
            success: false,
            error: details ? `${reason}\n${details}` : reason,
          };
        }
      }

      case 'search_files': {
        // 跨平台文件搜索（不依赖 grep）
        const searchPath = pathResolve(workingDir, input.path || '.');
        const matches: string[] = [];
        let searchCount = 0;
        const MAX_FILES = 1000;
        const MAX_DEPTH = 10;

        async function searchDir(dirPath: string, depth = 0): Promise<void> {
          if (depth > MAX_DEPTH || searchCount > MAX_FILES) return;

          try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });

            for (const entry of entries) {
              searchCount++;
              const fullPath = pathResolve(dirPath, entry.name);

              if (entry.isDirectory()) {
                // 跳过 node_modules 和 .git 目录
                if (entry.name !== 'node_modules' && entry.name !== '.git') {
                  await searchDir(fullPath, depth + 1);
                }
              } else if (entry.isFile()) {
                try {
                  const content = fs.readFileSync(fullPath, 'utf-8');
                  if (content.includes(input.pattern)) {
                    const relativePath = fullPath.replace(workingDir + '/', '').replace(workingDir + '\\', '');
                    matches.push(relativePath);
                  }
                } catch {
                  // 忽略无法读取的文件
                }
              }
            }
          } catch {
            // 忽略无法访问的目录
          }
        }

        await searchDir(searchPath);
        return {
          success: true,
          content: matches.length > 0 ? matches.join('\n') : '未找到匹配结果',
        };
      }

      case 'glob_files': {
        // @ts-ignore - Electron 环境中有 require
        const fg = require('fast-glob');
        const basePath = pathResolve(workingDir, input.path || '.');
        const pattern = input.pattern;

        try {
          const files = await fg.glob(pattern, {
            cwd: basePath,
            absolute: false,
            onlyFiles: true,
          });

          if (files.length === 0) {
            return { success: true, content: `未找到匹配文件: ${pattern}` };
          }

          const sortedFiles = files.sort();
          const content = sortedFiles.join('\n');
          return { success: true, content };
        } catch (error: any) {
          return { success: false, error: `Glob 模式错误: ${error.message}` };
        }
      }

      case 'ask_user_question': {
        const questionId = generateQuestionId();
        const callback = getUserQuestionCallback();
        if (!callback) {
          console.error('[executeTool] ask_user_question: callback NOT SET!');
          return { success: false, error: '用户问题回调未设置' };
        }

        // 使用当前执行的 agentId
        const agentId = currentExecutingAgentId || 'unknown';
        console.log('[executeTool] ask_user_question:', { agentId, questionId, question: input.question, options: input.options });

        // 调用回调获取用户回答
        console.log('[executeTool] Calling callback, waiting for user response...');
        const answer = await callback({
          id: questionId,
          question: input.question,
          options: input.options,
          multiple: input.multiple,
          agentId,
        });

        console.log('[executeTool] Got user answer:', answer);
        return { success: true, content: JSON.stringify({ questionId, answer }) };
      }

      case 'create_plan': {
        const questionId = generateQuestionId();
        const callback = getUserQuestionCallback();
        if (!callback) {
          return { success: false, error: '用户问题回调未设置' };
        }

        // 使用 AI 生成计划步骤
        const planPrompt = `请将以下任务分解为 ${input.maxSteps || 5} 个具体步骤：

任务: ${input.task}

请以 JSON 数组格式返回步骤列表，每个步骤包含:
- title: 步骤标题
- description: 详细描述
- estimatedTime: 预计时间（分钟）

返回格式:
[
  {
    "title": "步骤1标题",
    "description": "详细描述",
    "estimatedTime": 5
  }
]`;

        const planAnswer = await callback({
          id: questionId,
          question: planPrompt,
          agentId: currentExecutingAgentId || 'unknown',
        });

        return { success: true, content: JSON.stringify({ questionId, plan: planAnswer }) };
      }

      case 'execute_parallel': {
        const callback = getParallelExecutionCallback();
        if (!callback) {
          return { success: false, error: '并行执行回调未设置' };
        }

        try {
          const results = await callback({
            subtasks: input.subtasks || [],
            executionMode: input.executionMode || 'parallel',
          });

          const resultArray = Array.from(results.entries());
          return {
            success: true,
            content: `并行执行完成。结果:\n${resultArray.map(([id, result]) => `${id}: ${result}`).join('\n')}`
          };
        } catch (error: any) {
          return { success: false, error: `并行执行失败: ${error.message}` };
        }
      }

      default:
        return { success: false, error: `未知工具: ${name}` };
    }
  } catch (error: any) {
    console.error('[executeToolElectron] Error:', error);
    console.error('[executeToolElectron] Error message:', error.message);
    console.error('[executeToolElectron] Error stack:', error.stack);
    return { success: false, error: error.message || '执行失败' };
  }
}

/**
 * 浏览器环境的工具执行（模拟数据）
 */
async function executeToolBrowser(
  name: string,
  input: any
): Promise<ToolResult> {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

  try {
    switch (name) {
      case 'read_file':
        return {
          success: true,
          content: `// 模拟文件内容: ${input.path}\n// 这是浏览器环境中的模拟结果\n// 请在 Electron 桌面应用中运行以获得真实文件操作`
        };

      case 'write_file':
        return {
          success: true,
          content: `新文件已创建（模拟）: ${input.path}\n内容长度: ${input.content?.length || 0} 字符`
        };

      case 'edit_file':
        return {
          success: true,
          content: `文件已编辑（模拟）: ${input.path}`
        };

      case 'apply_patch':
        return {
          success: true,
          content: '补丁已应用（模拟）'
        };

      case 'list_files':
        return {
          success: true,
          content: `📁 src/\n📄 package.json\n📄 README.md\n📄 tsconfig.json\n\n（模拟目录列表 - 请在 Electron 中运行获得真实结果）`
        };

      case 'run_command':
        return {
          success: true,
          content: `$ ${input.command}\n命令执行完成（模拟输出）\nExit code: 0`
        };

      case 'search_files':
        return {
          success: true,
          content: `src/App.tsx:42: found match\nsrc/agent/index.ts:15: found match\n\n（模拟搜索结果）`
        };

      case 'glob_files':
        return {
          success: true,
          content: `src/App.tsx\nsrc/agent/tools.ts\nsrc/agent/AgentBridge.ts\nsrc/agent/index.ts\n\n（模拟 Glob 结果 - 模式: ${input.pattern}）`
        };

      case 'ask_user_question':
        return {
          success: true,
          content: `[等待用户回答问题: ${input.question}]`
        };

      case 'create_plan':
        return {
          success: true,
          content: `[正在为任务制定计划: ${input.task}]`
        };

      case 'execute_parallel':
        return {
          success: true,
          content: `并行执行 ${input.subtasks?.length || 0} 个子任务（模拟）\n执行模式: ${input.executionMode || 'parallel'}`
        };

      default:
        return {
          success: false,
          error: `未知工具: ${name}`
        };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || '执行失败'
    };
  }
}

// ==================== 用户交互回调 ====================

type UserQuestionCallback = (question: {
  id: string;
  question: string;
  options?: string[];
  multiple?: boolean;
  agentId: string;  // 添加 agentId
}) => Promise<string | string[]>;

type ParallelExecutionCallback = (request: {
  subtasks: Array<{ description: string; dependencies: string[] }>;
  executionMode: 'sequential' | 'parallel';
}) => Promise<Map<string, string>>;

let userQuestionCallback: UserQuestionCallback | null = null;
let parallelExecutionCallback: ParallelExecutionCallback | null = null;
let questionCounter = 0;

// 当前执行的 Agent ID（用于工具执行上下文）
let currentExecutingAgentId: string | null = null;

/**
 * 设置当前执行的 Agent ID
 */
export function setCurrentExecutingAgentId(agentId: string): void {
  currentExecutingAgentId = agentId;
}

/**
 * 获取当前执行的 Agent ID
 */
export function getCurrentExecutingAgentId(): string | null {
  return currentExecutingAgentId;
}

/**
 * 清除当前执行的 Agent ID
 */
export function clearCurrentExecutingAgentId(): void {
  currentExecutingAgentId = null;
}

/**
 * 设置用户问题回调
 */
export function setUserQuestionCallback(callback: UserQuestionCallback | null): void {
  userQuestionCallback = callback;
}

/**
 * 获取当前问题回调
 */
export function getUserQuestionCallback(): UserQuestionCallback | null {
  return userQuestionCallback;
}

/**
 * 生成问题 ID
 */
export function generateQuestionId(): string {
  return `question_${++questionCounter}_${Date.now()}`;
}

/**
 * 设置并行执行回调
 */
export function setParallelExecutionCallback(callback: ParallelExecutionCallback | null): void {
  parallelExecutionCallback = callback;
}

/**
 * 获取当前并行执行回调
 */
export function getParallelExecutionCallback(): ParallelExecutionCallback | null {
  return parallelExecutionCallback;
}
