export type BrainstormPhase =
  | 'IDLE'
  | 'SUMMONING'
  | 'CLARIFYING'
  | 'OPTIONS'
  | 'DESIGNING'
  | 'SPEC_READY'
  | 'PLAN_READY'
  | 'APPROVAL_PENDING'
  | 'EXECUTING'
  | 'FINISHED'
  | 'ERROR';

export interface BrainstormMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  agentId?: string;
}

export interface BrainstormArtifacts {
  specContent?: string;
  planContent?: string;
  specPath?: string;
  planPath?: string;
}

export interface BrainstormSessionState extends BrainstormArtifacts {
  id: string;
  parentAgentId: string;
  subAgentIds: string[];
  topic: string;
  optionsSummary?: string;
  phase: BrainstormPhase;
  isBusy: boolean;
  createdAt: number;
  updatedAt: number;
  messages: BrainstormMessage[];
  error?: string;
}

export type BrainstormEventType =
  | 'brainstorm_started'
  | 'phase_changed'
  | 'artifact_ready'
  | 'approval_required'
  | 'brainstorm_completed';

export interface BrainstormEvent {
  type: BrainstormEventType;
  sessionId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function toDateStamp(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

export function sanitizeTopicForFilename(topic: string): string {
  const safe = topic
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!safe) return 'brainstorm-task';
  return safe.slice(0, 48);
}

export function buildArtifactPaths(workingDirectory: string, topic: string, date = new Date()): {
  specRelativePath: string;
  planRelativePath: string;
} {
  const stamp = toDateStamp(date);
  const slug = sanitizeTopicForFilename(topic);
  return {
    specRelativePath: `superpowers/specs/${stamp}-${slug}-spec.md`,
    planRelativePath: `superpowers/plans/${stamp}-${slug}-plan.md`,
  };
}

export function transcriptFromMessages(messages: BrainstormMessage[]): string {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')
    .slice(0, 16000);
}

export type BrainstormRole = 'planner' | 'reviewer' | 'executor';
export type BrainstormDiscussionStage = 'clarification' | 'options' | 'spec' | 'plan';

const ROLE_PROMPT_LABELS: Record<BrainstormRole, string> = {
  planner: 'Planner',
  reviewer: 'Reviewer',
  executor: 'Executor',
};

const STAGE_PROMPT_LABELS: Record<BrainstormDiscussionStage, string> = {
  clarification: '需求澄清',
  options: '候选方案讨论',
  spec: 'Spec 讨论',
  plan: 'Plan 讨论',
};

export function buildRoleDiscussionPrompt(
  role: BrainstormRole,
  stage: BrainstormDiscussionStage,
  topic: string,
  transcript: string,
  stageObjective: string,
  priorRoundNotes = ''
): string {
  return `You are acting as the ${ROLE_PROMPT_LABELS[role]} in a multi-agent brainstorming room.

Current stage:
${STAGE_PROMPT_LABELS[stage]}

Topic:
${topic || 'Untitled brainstorming task'}

Stage objective:
${stageObjective}

Conversation transcript:
${transcript || '(no transcript)'}

Current round notes from other agents:
${priorRoundNotes || '(none yet)'}

Output requirements (Chinese, Markdown):
- Start with heading: "### ${ROLE_PROMPT_LABELS[role]} 观点"
- Provide exactly 3 short bullets:
  1) "结论"
  2) "理由"
  3) "建议给下一位 Agent"
- Keep response concise and concrete.
- Do not output code.
`;
}

export function buildClarificationReplyPrompt(topic: string, transcript: string, userInput: string): string {
  return `You are a Planner sub-agent in a multi-agent brainstorming room.

Session Topic:
${topic || 'Untitled brainstorming task'}

Conversation so far:
${transcript || '(no prior transcript)'}

Latest user input:
${userInput}

Instructions:
1) Respond in concise Chinese.
2) Clarify assumptions, constraints, and success criteria.
3) Ask at most 2 high-value follow-up questions.
4) Do not write code.
`;
}

export function buildOptionsPrompt(topic: string, transcript: string): string {
  return `You are a Planner + Reviewer pair producing candidate approaches.

Topic:
${topic || 'Untitled brainstorming task'}

Transcript:
${transcript || '(no transcript)'}

Output requirements (Chinese, Markdown):
- Section: "## 候选方案"
- Provide exactly 3 options.
- For each option include: "思路", "优点", "风险", "适用场景".
- End with section "## 推荐方案" and pick one option with brief reason.
`;
}

export function buildSpecPrompt(topic: string, transcript: string, optionsSummary: string): string {
  return `You are writing a design spec that follows the superpowers brainstorming spirit.

Topic:
${topic || 'Untitled brainstorming task'}

Transcript:
${transcript || '(no transcript)'}

Candidate options:
${optionsSummary || '(none)'}

Output requirements (Chinese, Markdown):
- Title: "# ${topic || 'Brainstorm Feature'} Spec"
- Include sections in order:
  1. "## 背景与目标"
  2. "## 用户价值"
  3. "## 设计决策"
  4. "## 交互流程"
  5. "## 接口与数据结构"
  6. "## 风险与回退"
  7. "## 验收标准"
- Keep it implementation-ready and decision-complete.
`;
}

export function buildPlanPrompt(topic: string, specMarkdown: string): string {
  return `You are writing an implementation plan from a completed spec.

Topic:
${topic || 'Untitled brainstorming task'}

Spec:
${specMarkdown.slice(0, 18000)}

Output requirements (Chinese, Markdown):
- Title format: "# ${topic || 'Feature'} Implementation Plan"
- Include short sections:
  1. "## Summary"
  2. "## Implementation Changes"
  3. "## Test Plan"
  4. "## Assumptions"
- Under "Implementation Changes", provide numbered, executable steps.
- Each step must be concrete and testable.
- Do not use placeholders like "完善代码".
`;
}
