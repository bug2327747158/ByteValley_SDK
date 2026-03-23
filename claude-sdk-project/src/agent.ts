/**
 * 统一的 Claude Agent
 * 支持 Anthropic 官方 API 和智谱 AI API
 * 工具调度机制完全一致，只有 API 端点不同
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile, readdir, stat } from "fs/promises";
import { execSync } from "child_process";
import { join } from "path";
import { env } from "./config";

// ==================== 工具定义 ====================

export interface Tool {
  name: string;
  description: string;
  inputSchema: any;
}

export const DEFAULT_TOOLS: Tool[] = [
  {
    name: "read_file",
    description: "读取文件内容",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件路径" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "写入文件内容（覆盖或创建新文件）",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件路径" },
        content: { type: "string", description: "文件内容" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "编辑文件（替换指定的文本）",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件路径" },
        oldText: { type: "string", description: "要替换的文本" },
        newText: { type: "string", description: "新文本" },
      },
      required: ["path", "oldText", "newText"],
    },
  },
  {
    name: "list_files",
    description: "列出目录中的文件和文件夹",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "目录路径（默认当前目录）" },
      },
      required: [],
    },
  },
  {
    name: "run_command",
    description: "执行终端命令",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "要执行的命令" },
      },
      required: ["command"],
    },
  },
  {
    name: "search_files",
    description: "在文件中搜索文本内容",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "搜索路径" },
        pattern: { type: "string", description: "搜索模式（支持正则表达式）" },
      },
      required: ["path", "pattern"],
    },
  },
];

// ==================== 工具执行 ====================

export interface ToolResult {
  success: boolean;
  content?: string;
  error?: string;
}

export async function executeTool(
  name: string,
  input: any,
  cwd: string = process.cwd()
): Promise<ToolResult> {
  try {
    switch (name) {
      case "read_file": {
        const content = await readFile(join(cwd, input.path), "utf-8");
        return { success: true, content };
      }

      case "write_file": {
        await writeFile(join(cwd, input.path), input.content, "utf-8");
        return { success: true, content: `文件已写入: ${input.path}` };
      }

      case "edit_file": {
        const fullPath = join(cwd, input.path);
        let content = await readFile(fullPath, "utf-8");
        if (!content.includes(input.oldText)) {
          return { success: false, error: "未找到要替换的文本" };
        }
        content = content.replace(input.oldText, input.newText);
        await writeFile(fullPath, content, "utf-8");
        return { success: true, content: `文件已编辑: ${input.path}` };
      }

      case "list_files": {
        const targetPath = join(cwd, input.path || ".");
        const entries = await readdir(targetPath, { withFileTypes: true });
        const files = entries
          .map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`)
          .join("\n");
        return { success: true, content: files || "(空目录)" };
      }

      case "run_command": {
        const result = execSync(input.command, {
          cwd,
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        });
        return { success: true, content: result.trim() };
      }

      case "search_files": {
        // 跨平台文件搜索（不依赖 grep）
        const targetPath = join(cwd, input.path || ".");
        const matches: string[] = [];
        let searchCount = 0;
        const MAX_FILES = 1000; // 防止搜索过大目录

        async function searchDir(dirPath: string, depth = 0): Promise<void> {
          if (depth > 10 || searchCount > MAX_FILES) return; // 防止过度递归

          try {
            const entries = await readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
              searchCount++;
              const fullPath = join(dirPath, entry.name);

              if (entry.isDirectory()) {
                // 跳过 node_modules 和 .git 目录
                if (entry.name !== "node_modules" && entry.name !== ".git") {
                  await searchDir(fullPath, depth + 1);
                }
              } else if (entry.isFile()) {
                try {
                  const content = await readFile(fullPath, "utf-8");
                  if (content.includes(input.pattern)) {
                    const relativePath = fullPath.replace(cwd + "/", "").replace(cwd + "\\", "");
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

        await searchDir(targetPath);
        return {
          success: true,
          content: matches.length > 0 ? matches.join("\n") : "未找到匹配结果",
        };
      }

      default:
        return { success: false, error: `未知工具: ${name}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ==================== Agent 配置 ====================

export interface AgentOptions {
  model?: string;
  tools?: Tool[];
  maxTokens?: number;
  onMessage?: (content: string) => void;
  onToolUse?: (toolName: string, input: any) => void;
  onToolResult?: (toolName: string, result: ToolResult) => void;
  onToolStart?: (toolName: string, input: any) => void;
  onLoopStep?: (step: number, toolCount: number) => void;
}

export interface AgentConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

// ==================== Agent 类 ====================

export class ClaudeAgent {
  private client: Anthropic;
  private config: AgentConfig;
  private tools: Tool[];
  private messages: Anthropic.MessageParam[] = [];
  private static readonly MAX_STEPS = 10;
  private static readonly MAX_MESSAGES = 20;

  constructor(config: AgentConfig) {
    this.config = config;
    this.client = new Anthropic({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      maxRetries: 2,
      timeout: env.API_TIMEOUT_MS,
    });
    this.tools = DEFAULT_TOOLS;
  }

  /**
   * 设置可用工具
   */
  setTools(tools: Tool[]): void {
    this.tools = tools;
  }

  /**
   * 添加自定义工具
   */
  addTool(tool: Tool): void {
    this.tools.push(tool);
  }

  /**
   * 添加自定义工具执行器
   */
  private customToolExecutors: Map<string, (input: any) => Promise<ToolResult>> =
    new Map();

  onTool(name: string, executor: (input: any) => Promise<ToolResult>): void {
    this.customToolExecutors.set(name, executor);
  }

  /**
   * 裁剪消息历史，防止 token 爆炸
   * 保留第一条（系统提示）和最近的 MAX_MESSAGES 条消息
   */
  private trimMessages(maxMessages: number = ClaudeAgent.MAX_MESSAGES): void {
    if (this.messages.length > maxMessages) {
      this.messages = [
        this.messages[0], // 保留第一条（通常是系统消息）
        ...this.messages.slice(-maxMessages),
      ];
    }
  }

  /**
   * 清空对话历史
   */
  clearHistory(): void {
    this.messages = [];
  }

  /**
   * 添加用户消息
   */
  addUserMessage(content: string): void {
    this.messages.push({ role: "user", content });
  }

  /**
   * 运行 Agent
   */
  async run(
    prompt: string,
    options: AgentOptions = {}
  ): Promise<string> {
    const {
      maxTokens = 8192,
      onMessage = console.log,
      onToolUse = (name, input) => console.log(`🔧 ${name}`, input),
      onToolResult = (name, result) =>
        console.log(`   ${result.success ? "✅" : "❌"}`, result.content || result.error),
      onToolStart,
      onLoopStep,
    } = options;

    // 添加用户消息
    this.addUserMessage(prompt);

    // 对话循环
    let step = 0;
    let finalResponse = "";

    while (step < ClaudeAgent.MAX_STEPS) {
      step++;

      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: maxTokens,
        tools: this.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        })),
        messages: this.messages,
      });

      // 收集所有 text 和 tool_use block
      const toolUses: Anthropic.ToolUseBlock[] = [];
      for (const block of response.content) {
        if (block.type === "text") {
          finalResponse = block.text;
          onMessage(`\n🤖 Claude:\n${block.text}\n`);
        } else if (block.type === "tool_use") {
          toolUses.push(block);
        }
      }

      // 没有工具调用，返回结果
      if (toolUses.length === 0) {
        return finalResponse;
      }

      // 触发循环步骤回调
      onLoopStep?.(step, toolUses.length);

      // 并行执行所有工具
      const results = await Promise.all(
        toolUses.map(async (block) => {
          onToolStart?.(block.name, block.input);
          onToolUse(block.name, block.input);

          try {
            const executor = this.customToolExecutors.get(block.name);
            const rawResult = executor
              ? await executor(block.input)
              : await executeTool(block.name, block.input);

            const structuredResult = JSON.stringify({
              ok: rawResult.success,
              output: rawResult.content,
              error: rawResult.error,
            });

            onToolResult(block.name, rawResult);

            return { id: block.id, result: structuredResult };
          } catch (err: any) {
            const errorResult = JSON.stringify({
              ok: false,
              error: err.message,
            });
            return { id: block.id, result: errorResult };
          }
        })
      );

      // 添加消息历史
      for (let i = 0; i < toolUses.length; i++) {
        this.messages.push({ role: "assistant", content: [toolUses[i]] });
        this.messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: results[i].id,
              content: results[i].result,
            },
          ],
        });
      }

      // 裁剪消息历史
      this.trimMessages();
    }

    throw new Error("Agent loop exceeded max steps");
  }

  /**
   * 流式运行 Agent（每次返回一个消息块）
   */
  async *stream(
    prompt: string,
    options: AgentOptions = {}
  ): AsyncGenerator<{ type: string; data: any }> {
    const {
      maxTokens = 8192,
      onToolStart,
      onToolUse,
      onToolResult,
      onLoopStep,
    } = options;

    this.addUserMessage(prompt);

    let step = 0;

    while (step < ClaudeAgent.MAX_STEPS) {
      step++;

      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: maxTokens,
        tools: this.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        })),
        messages: this.messages,
      });

      // 收集所有 text 和 tool_use block
      const toolUses: Anthropic.ToolUseBlock[] = [];
      for (const block of response.content) {
        if (block.type === "text") {
          yield { type: "text", data: block.text };
        } else if (block.type === "tool_use") {
          toolUses.push(block);
        }
      }

      // 没有工具调用，完成
      if (toolUses.length === 0) {
        yield { type: "done", data: null };
        return;
      }

      // 触发循环步骤回调
      onLoopStep?.(step, toolUses.length);

      // 先 yield 所有 tool_use 事件
      for (const block of toolUses) {
        onToolStart?.(block.name, block.input);
        onToolUse?.(block.name, block.input);
        yield {
          type: "tool_use",
          data: { name: block.name, input: block.input },
        };
      }

      // 并行执行所有工具，收集结果
      const results = await Promise.all(
        toolUses.map(async (block) => {
          try {
            const executor = this.customToolExecutors.get(block.name);
            const rawResult = executor
              ? await executor(block.input)
              : await executeTool(block.name, block.input);

            const structuredResult = JSON.stringify({
              ok: rawResult.success,
              output: rawResult.content,
              error: rawResult.error,
            });

            onToolResult?.(block.name, rawResult);

            return {
              id: block.id,
              result: structuredResult,
              name: block.name,
              rawResult,
            };
          } catch (err: any) {
            const errorResult = JSON.stringify({
              ok: false,
              error: err.message,
            });
            return {
              id: block.id,
              result: errorResult,
              name: block.name,
              rawResult: { success: false, error: err.message },
            };
          }
        })
      );

      // yield 所有 tool_result 事件
      for (const r of results) {
        yield {
          type: "tool_result",
          data: { name: r.name, result: r.rawResult },
        };
      }

      // 添加消息历史
      for (let i = 0; i < toolUses.length; i++) {
        this.messages.push({ role: "assistant", content: [toolUses[i]] });
        this.messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: results[i].id,
              content: results[i].result,
            },
          ],
        });
      }

      // 裁剪消息历史
      this.trimMessages();
    }

    throw new Error("Agent loop exceeded max steps");
  }
}

// ==================== 便捷函数 ====================

/**
 * 创建 Agent 实例
 */
export function createAgent(config?: Partial<AgentConfig>): ClaudeAgent {
  return new ClaudeAgent({
    apiKey: config?.apiKey || env.ANTHROPIC_AUTH_TOKEN,
    baseURL: config?.baseURL || env.ANTHROPIC_BASE_URL,
    model: config?.model || env.ANTHROPIC_MODEL,
  });
}

/**
 * 快速查询（一次性会话）
 */
export async function query(
  prompt: string,
  options: AgentOptions & { config?: Partial<AgentConfig> } = {}
): Promise<string> {
  const agent = createAgent(options.config);
  return agent.run(prompt, options);
}
