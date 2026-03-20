/**
 * 统一的 Claude Agent
 * 支持 Anthropic 官方 API 和智谱 AI API
 * 工具调度机制完全一致，只有 API 端点不同
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile, readdir } from "fs/promises";
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
        const result = execSync(
          `grep -r "${input.pattern}" ${input.path || "."} 2>/dev/null || true`,
          { cwd, encoding: "utf-8" }
        );
        return { success: true, content: result.trim() || "未找到匹配结果" };
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
    } = options;

    // 添加用户消息
    this.addUserMessage(prompt);

    // 对话循环
    let finalResponse = "";

    while (true) {
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

      // 处理响应
      let hasToolUse = false;

      for (const block of response.content) {
        if (block.type === "text") {
          finalResponse = block.text;
          onMessage(`\n🤖 Claude:\n${block.text}\n`);
        } else if (block.type === "tool_use") {
          hasToolUse = true;
          onToolUse(block.name, block.input);

          // 执行工具
          let result: ToolResult;
          if (this.customToolExecutors.has(block.name)) {
            result = await this.customToolExecutors.get(block.name)!(block.input);
          } else {
            result = await executeTool(block.name, block.input);
          }

          onToolResult(block.name, result);

          // 添加到消息历史
          this.messages.push({ role: "assistant", content: [block] });
          this.messages.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: block.id,
                content: result.error || result.content || "",
              },
            ],
          });
        }
      }

      // 如果没有工具调用，返回结果
      if (!hasToolUse) {
        return finalResponse;
      }
    }
  }

  /**
   * 流式运行 Agent（每次返回一个消息块）
   */
  async *stream(
    prompt: string,
    options: AgentOptions = {}
  ): AsyncGenerator<{ type: string; data: any }> {
    this.addUserMessage(prompt);

    while (true) {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: options.maxTokens || 8192,
        tools: this.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        })),
        messages: this.messages,
      });

      let hasToolUse = false;

      for (const block of response.content) {
        if (block.type === "text") {
          yield { type: "text", data: block.text };
        } else if (block.type === "tool_use") {
          hasToolUse = true;
          yield { type: "tool_use", data: { name: block.name, input: block.input } };

          const result = this.customToolExecutors.has(block.name)
            ? await this.customToolExecutors.get(block.name)!(block.input)
            : await executeTool(block.name, block.input);

          yield { type: "tool_result", data: { name: block.name, result } };

          this.messages.push({ role: "assistant", content: [block] });
          this.messages.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: block.id,
                content: result.error || result.content || "",
              },
            ],
          });
        }
      }

      if (!hasToolUse) {
        yield { type: "done", data: null };
        return;
      }
    }
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
