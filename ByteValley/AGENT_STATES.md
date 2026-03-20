# AI Agent Workspace - States & Logic

This document records the different states of the AI agents in the workspace, their triggers, and visual representations. The simulation UI has been removed, but the underlying logic remains intact.

## Agent States

### 1. IDLE
- **Description:** The agent is waiting for tasks.
- **Zone:** Usually stays in the last assigned zone or the Roundtable.
- **Visuals:** Default idle animation (bobbing up and down).
- **Eye Color:** Green (`#10b981`).

### 2. THINKING
- **Description:** Analyzing user requests or brainstorming.
- **Zone:** Roundtable (`ROUNDTABLE`).
- **Visuals:** 
  - Variant 0: Thinking bubble.
  - Variant 1: Holographic Globe.
  - Variant 2: Pixel Lightbulb.
- **Eye Color:** Yellow (`#f59e0b`).

### 3. READING
- **Description:** Searching the codebase, performing RAG (Retrieval-Augmented Generation), or reading files.
- **Zone:** Library (`LIBRARY`).
- **Visuals:**
  - Variant 0: Holding a brown book with white pages.
  - Variant 1: Data Scan Laser.
  - Variant 2: Floating scrolls.
- **Eye Color:** Blue (`#3b82f6`).

### 4. WRITING
- **Description:** Writing code, refactoring, or modifying files.
- **Zone:** Workshop (`WORKSHOP`).
- **Visuals:**
  - Variant 0: Hammering.
  - Variant 1: Soldering/Welding.
  - Variant 2: Screwdriver.
- **Eye Color:** Blue (`#3b82f6`).

### 5. EXECUTING
- **Description:** Running bash commands, executing tests, or deploying.
- **Zone:** Server Room / Proving Grounds (`PROVING_GROUNDS`).
- **Visuals:**
  - Variant 0: Typing on a keyboard.
  - Variant 1: Server rack blinking lights.
  - Variant 2: Progress bar.
- **Eye Color:** Green (`#10b981`).

### 6. ERROR
- **Description:** Command failed, or an error occurred during execution.
- **Zone:** Stays in the current zone.
- **Visuals:**
  - Variant 0: Explosion effect (orange/red particles).
  - Variant 1: Smoke effect.
  - Variant 2: Glitch effect.
- **Eye Color:** Red (`#ef4444`).

### 7. AWAITING_APPROVAL
- **Description:** Requires user permission to proceed (e.g., `git push`, deleting files).
- **Zone:** Roundtable (`ROUNDTABLE`).
- **Visuals:** A modal appears asking for user approval (Accept/Reject).
- **Eye Color:** Yellow (`#f59e0b`).

### 8. SUCCESS
- **Description:** Task completed successfully. Taking a break.
- **Zone:** Rest Area (`REST_AREA`).
- **Visuals:**
  - Variant 0: Drinking coffee.
  - Variant 1: Sleeping (Zzz).
  - Variant 2: Playing handheld game.
  - Variant 3: Listening to music.
- **Eye Color:** Pink (`#ec4899`).

## Interaction Logic

- **Selection:** Clicking on an agent selects it (indicated by a yellow dashed ring).
- **Movement:** Clicking on the floor moves the currently selected agent to that location.
- **Emergency Button:** Clicking the red button on the Roundtable triggers a global "THINKING" state (Brainstorming Mode), calling all agents to the table.
- **Rest Area:** Clicking the Rest Area sends the selected agent to take a break (`SUCCESS` state).
- **Bulletin Board:** Clicking the Bulletin Board opens the task management UI.
- **Deletion:** Dragging an agent to the trash icon deletes it.
