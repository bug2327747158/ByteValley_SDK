# Claude Agent SDK 功能清单

详细列出当前 SDK 支持的所有功能。

## 核心功能

### 1. 对话管理

| 功能 | 说明 | API |
|------|------|-----|
| 单轮对话 | 一次性查询 | `query(prompt)` |
| 多轮对话 | 自动维护对话历史 | `agent.run(prompt)` |
| 清空历史 | 清除对话上下文 | `agent.clearHistory()` |
| 手动添加消息 | 向历史添加消息 | `agent.addUserMessage(content)` |

### 2. 工具系统

#### 内置工具

| 工具名 | 功能 | 参数 |
|--------|------|------|
| `read_file` | 读取文件内容 | `path` |
| `write_file` | 写入/覆盖文件 | `path`, `content` |
| `edit_file` | 替换文件中的文本 | `path`, `oldText`, `newText` |
| `list_files` | 列出目录内容 | `path` (可选) |
| `run_command` | 执行终端命令 | `command` |
| `search_files` | 搜索文件内容 | `path`, `pattern` |

#### 自定义工具

```typescript
// 添加工具定义
agent.addTool({
  name: "my_tool",
  description: "工具描述",
  inputSchema: { /* JSON Schema */ }
});

// 注册工具执行器
agent.onTool("my_tool", async (input) => {
  return { success: true, content: "结果" };
});
```

### 3. 运行模式

| 模式 | 说明 | API |
|------|------|-----|
| 标准模式 | 等待完整响应 | `agent.run(prompt, options)` |
| 流式模式 | 逐步返回内容 | `for await (const chunk of agent.stream(prompt))` |

### 4. 回调钩子

| 钩子 | 触发时机 | 用途 |
|------|----------|------|
| `onMessage` | 收到文本消息 | 日志、UI 更新 |
| `onToolUse` | 即将使用工具 | 记录工具调用 |
| `onToolResult` | 工具执行完成 | 处理工具结果 |

### 5. 配置选项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiKey` | string | 环境变量 | API 认证密钥 |
| `baseURL` | string | 环境变量 | API 端点 |
| `model` | string | 环境变量 | 模型名称 |
| `maxTokens` | number | 8192 | 最大输出 token 数 |
| `tools` | Tool[] | 6 个内置工具 | 可用工具列表 |

### 6. 错误处理

```typescript
// 工具执行结果
interface ToolResult {
  success: boolean;    // 是否成功
  content?: string;    // 成功内容
  error?: string;      // 错误信息
}
```

### 7. 多 Agent 支持

#### 特性

- ✅ 每个 Agent 独立的对话历史
- ✅ 每个 Agent 独立的工具配置
- ✅ 支持并行执行多个 Agent
- ✅ 支持 Agent 间协作（传递结果）
- ✅ 支持流式多 Agent

#### 示例

```typescript
// 创建多个 Agent
const agent1 = createAgent();
const agent2 = createAgent();
const agent3 = createAgent();

// 串行执行
await agent1.run("任务1");
await agent2.run("任务2");
await agent3.run("任务3");

// 并行执行
const results = await Promise.all([
  agent1.run("任务1"),
  agent2.run("任务2"),
  agent3.run("任务3"),
]);

// Agent 协作
const result1 = await agent1.run("研究主题");
const result2 = await agent2.run(`基于: ${result1}`);
```

## 高级特性

### 1. 流式输出

```typescript
for await (const chunk of agent.stream("prompt")) {
  if (chunk.type === "text") {
    // 文本内容
    console.log(chunk.data);
  } else if (chunk.type === "tool_use") {
    // 工具调用
    console.log("工具:", chunk.data.name);
  } else if (chunk.type === "tool_result") {
    // 工具结果
    console.log("结果:", chunk.data.result);
  } else if (chunk.type === "done") {
    // 完成
    break;
  }
}
```

### 2. 工具链

Agent 可以连续调用多个工具来完成复杂任务：

```
用户输入 → read_file → edit_file → write_file → 完成
```

### 3. 对话上下文保留

```typescript
// 第一轮
await agent.run("创建文件 data.txt");

// 第二轮（记得上一轮的内容）
await agent.run("把文件内容改成 hello");

// 第三轮（仍然记得）
await agent.run("读取文件确认");
```

### 4. 工具结果反馈

工具执行结果会自动返回给模型，模型可以：
- 根据结果继续操作
- 失败时重试
- 完成后给用户总结

## 限制与注意事项

### 当前限制

| 限制 | 说明 | 计划 |
|------|------|------|
| 本地工具执行 | 所有工具在本地执行 | - |
| 无并发安全 | 同一 Agent 不支持并发调用 | 文档说明 |
| 无持久化 | 重启后历史丢失 | 未来版本 |
| 无流式 API 事件 | 流式模式下使用轮询 | - |

### 注意事项

1. **API 速率限制**：多 Agent 并行时注意 API 限制
2. **Token 消耗**：对话历史越长，消耗越多 token
3. **工具安全**：`run_command` 可执行任意命令，需谨慎
4. **文件路径**：所有文件操作相对于 `process.cwd()`

## 使用场景

### 适合场景

- ✅ 代码生成与修改
- ✅ 文件批量处理
- ✅ 自动化脚本
- ✅ 多方案对比
- ✅ 内容创作

### 不适合场景

- ❌ 高并发实时应用（考虑延迟）
- ❌ 需要持久化会话的场景
- ❌ 多用户共享状态

## API 参考

### ClaudeAgent 类

```typescript
class ClaudeAgent {
  // 配置
  setTools(tools: Tool[]): void
  addTool(tool: Tool): void
  onTool(name: string, executor: Function): void

  // 对话
  clearHistory(): void
  addUserMessage(content: string): void
  run(prompt: string, options?: AgentOptions): Promise<string>
  stream(prompt: string, options?: AgentOptions): AsyncGenerator
}

// 创建实例
function createAgent(config?: Partial<AgentConfig>): ClaudeAgent

// 快速查询
async function query(prompt: string, options?: AgentOptions): Promise<string>
```

### 类型定义

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: any;
}

interface ToolResult {
  success: boolean;
  content?: string;
  error?: string;
}

interface AgentOptions {
  model?: string;
  tools?: Tool[];
  maxTokens?: number;
  onMessage?: (content: string) => void;
  onToolUse?: (name: string, input: any) => void;
  onToolResult?: (name: string, result: ToolResult) => void;
}

interface AgentConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}
```
