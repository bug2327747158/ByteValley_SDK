# Claude Agent SDK 开发环境

统一的 Claude Agent 开发框架，支持**智谱 AI** 和 **Anthropic 官方 API**，工具调度机制完全一致。

## 特性

- ✅ **统一接口** - 同一套代码，不同 API 提供商
- ✅ **内置工具** - 文件读写、命令执行、文件搜索等
- ✅ **自定义工具** - 轻松扩展自己的工具
- ✅ **流式输出** - 支持流式响应
- ✅ **多轮对话** - 自动管理对话历史

## 项目结构

```
claude-sdk-project/
├── src/
│   ├── agent.ts                 # 🌟 核心 Agent 统一框架
│   ├── config.ts                # 环境配置
│   ├── examples-unified.ts      # 统一示例集合
│   ├── basic-agent.ts           # 官方 SDK 基础示例
│   ├── agent-with-tools.ts      # 官方 SDK 工具示例
│   ├── agent-with-hooks.ts      # 官方 SDK Hooks 示例
│   ├── zhipu-agent.ts           # 智谱 AI 基础示例
│   └── zhipu-tools.ts           # 智谱 AI 工具示例
├── .env                         # 环境变量（智谱 AI 已配置）
├── package.json
├── tsconfig.json
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 环境配置

`.env` 已配置为智谱 AI（直接可用）：

```env
ANTHROPIC_AUTH_TOKEN=59ad0142e7bb4b00b01a3bdcdc7a08aa.HnsXRASN06cpha48
ANTHROPIC_BASE_URL=https://open.bigmodel.cn/api/anthropic
ANTHROPIC_MODEL=glm-4.7
```

### 3. 运行统一示例

```bash
npm run examples
```

这将运行 5 个示例：
1. 基础对话
2. 使用工具创建文件
3. 多轮对话
4. 流式输出
5. 自定义工具

## 使用方式

### 方式一：快速查询

```typescript
import { query } from "./agent";

const response = await query("你好！");
console.log(response);
```

### 方式二：Agent 实例

```typescript
import { createAgent } from "./agent";

const agent = createAgent();

const response = await agent.run("创建一个文件 hello.txt", {
  onMessage: (msg) => console.log(msg),
  onToolUse: (name, input) => console.log(`使用工具: ${name}`),
  onToolResult: (name, result) => console.log(`结果:`, result),
});
```

### 方式三：流式输出

```typescript
const agent = createAgent();

for await (const chunk of agent.stream("列出当前目录文件")) {
  if (chunk.type === "text") {
    process.stdout.write(chunk.data);
  } else if (chunk.type === "tool_use") {
    console.log(`工具: ${chunk.data.name}`);
  }
}
```

## 内置工具

| 工具 | 描述 |
|------|------|
| `read_file` | 读取文件内容 |
| `write_file` | 写入/创建文件 |
| `edit_file` | 替换文件中的文本 |
| `list_files` | 列出目录文件 |
| `run_command` | 执行终端命令 |
| `search_files` | 搜索文件内容 |

## 自定义工具

```typescript
const agent = createAgent();

// 注册工具执行器
agent.onTool("my_tool", async (input) => {
  return { success: true, content: "结果" };
});

// 添加工具定义
agent.addTool({
  name: "my_tool",
  description: "我的自定义工具",
  inputSchema: {
    type: "object",
    properties: {
      param: { type: "string" },
    },
    required: ["param"],
  },
});
```

## 切换 API

### 使用智谱 AI（默认）
```bash
npm run examples
```

### 使用官方 Anthropic API

修改 `.env`：
```env
ANTHROPIC_API_KEY=sk-ant-xxxxx
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

或代码中指定：
```typescript
const agent = createAgent({
  apiKey: "sk-ant-xxxxx",
  baseURL: "https://api.anthropic.com",
  model: "claude-sonnet-4-20250514",
});
```

## 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run examples` | 统一示例集合（推荐） |
| `npm run zhipu` | 智谱 AI 基础对话 |
| `npm run zhipu-tools` | 智谱 AI 工具调用 |
| `npm run basic` | 官方 SDK 基础 |
| `npm run tools` | 官方 SDK 工具 |
| `npm run hooks` | 官方 SDK Hooks |

## API 对比

| 特性 | 智谱 AI | Anthropic 官方 |
|------|---------|----------------|
| Base URL | `open.bigmodel.cn` | `api.anthropic.com` |
| 认证 | `ANTHROPIC_AUTH_TOKEN` | `ANTHROPIC_API_KEY` |
| 模型 | `glm-4.7` | `claude-sonnet-4` |
| 工具调用 | ✅ 支持 | ✅ 支持 |
| 流式输出 | ✅ 支持 | ✅ 支持 |

## 参考资源

- [智谱 AI 开放平台](https://open.bigmodel.cn/)
- [Anthropic 官方文档](https://platform.claude.com/docs)
- [Agent SDK 文档](https://platform.claude.com/docs/en/agent-sdk/overview)
