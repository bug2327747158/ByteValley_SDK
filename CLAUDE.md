# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ByteValley is a dual-project workspace for AI agent development and visualization:

1. **`claude-sdk-project/`** - A unified Claude Agent development framework supporting both 智谱 AI (Zhipu AI) and Anthropic official APIs with identical tool dispatching mechanisms
2. **`ByteValley/`** - A React + Vite application for visualizing AI agents across different workspace zones with state-based animations

## Common Commands

### claude-sdk-project (Node.js/TypeScript SDK)

```bash
# Run the unified examples (recommended for testing)
npm run examples

# Run individual examples
npm run basic          # Official SDK basic example
npm run tools          # Official SDK with tools
npm run hooks          # Official SDK with hooks
npm run zhipu          # Zhipu AI basic example
npm run zhipu-tools    # Zhipu AI with tools
npm run multi-agent    # Multi-agent parallel execution
npm run test-multi     # Test multi-agent scenarios
```

### ByteValley (React + Vite App)

```bash
npm run dev            # Start dev server on port 3000
npm run build          # Build for production
npm run preview        # Preview production build
npm run lint           # TypeScript type checking (noEmit)
```

**IMPORTANT**: This workspace is in WSL but the app runs on Windows. When testing `npm run dev`, ask the user to manually run and verify the dev server in their Windows terminal instead of running it from WSL. The dev server needs to be started in Windows to properly serve the React application.

## Architecture

### claude-sdk-project

**Core Framework (`src/agent.ts`)**

- `ClaudeAgent` class - Main agent interface with conversation management and tool orchestration
- `createAgent()` - Factory function for creating configured agent instances
- `query()` - Quick one-shot query function for simple interactions
- `executeTool()` - Built-in tool executor for file operations and command execution

**Built-in Tools:**
- `read_file` - Read file contents
- `write_file` - Write/overwrite files
- `edit_file` - Replace text within files
- `list_files` - List directory contents
- `run_command` - Execute terminal commands
- `search_files` - Search file content using grep

**Configuration (`src/config.ts`)**

Environment variables (default is Zhipu AI):
- `ANTHROPIC_AUTH_TOKEN` - API authentication token
- `ANTHROPIC_BASE_URL` - API endpoint (default: `https://open.bigmodel.cn/api/anthropic`)
- `ANTHROPIC_MODEL` - Model name (default: `glm-4.7`)
- `API_TIMEOUT_MS` - Request timeout (default: 120000ms)

**Switching APIs:**
- Zhipu AI (default): Already configured in `.env`
- Anthropic Official: Change `ANTHROPIC_BASE_URL` to `https://api.anthropic.com` and use `ANTHROPIC_API_KEY`

### ByteValley (React Visualization App)

**Agent State System (`AGENT_STATES.md`)**

The app visualizes agents in 8 states, each with specific zones and visuals:
- `IDLE` - Waiting, green eyes (#10b981)
- `THINKING` - Analyzing, yellow eyes (#f59e0b), at Roundtable
- `READING` - RAG/file operations, blue eyes (#3b82f6), at Library
- `WRITING` - Code editing, blue eyes (#3b82f6), at Workshop
- `EXECUTING` - Running commands, green eyes (#10b981), at Server Room
- `ERROR` - Failed operations, red eyes (#ef4444)
- `AWAITING_APPROVAL` - Needs user permission, yellow eyes (#f59e0b)
- `SUCCESS` - Task complete, pink eyes (#ec4899), at Rest Area

**Workspace Zones (ZONES constant in `src/App.tsx`):**
- `LIBRARY` - Left side, for reading/research
- `REST_AREA` - Right side, for breaks
- `ROUNDTABLE` - Center circular area, for thinking/collaboration
- `WORKSHOP` - Bottom left, for writing/coding
- `PROVING_GROUNDS` (Server Room) - Bottom right, for execution/testing

**Tech Stack:**
- React 19 with TypeScript (strict mode)
- Vite 6 for build tooling
- Tailwind CSS v4 for styling
- Motion for animations
- Lucide React for icons

## Key Implementation Details

### Multi-Agent Support (claude-sdk-project)

Each agent maintains independent conversation history and tool configuration:
```typescript
const agent1 = createAgent();
const agent2 = createAgent();

// Parallel execution
const results = await Promise.all([
  agent1.run("Task 1"),
  agent2.run("Task 2")
]);
```

### Custom Tool Registration

```typescript
const agent = createAgent();

// Add tool definition
agent.addTool({
  name: "my_tool",
  description: "Custom tool",
  inputSchema: {
    type: "object",
    properties: { param: { type: "string" } },
    required: ["param"]
  }
});

// Register executor
agent.onTool("my_tool", async (input) => {
  return { success: true, content: "Result" };
});
```

### Streaming Mode

```typescript
for await (const chunk of agent.stream("prompt")) {
  if (chunk.type === "text") {
    console.log(chunk.data);
  } else if (chunk.type === "tool_use") {
    console.log("Tool:", chunk.data.name);
  }
}
```

## Environment Setup

### claude-sdk-project

The `.env` file is pre-configured for Zhipu AI. No additional setup required for basic usage.

### ByteValley

Requires `GEMINI_API_KEY` in environment (for AI Studio integration). The app is configured for Google AI Studio deployment.

## TypeScript Configuration

- **claude-sdk-project**: CommonJS modules, target ES2022
- **ByteValley**: ESNext modules with bundler resolution, React JSX transform, path alias `@/*` → root directory
