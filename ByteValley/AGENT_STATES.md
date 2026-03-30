# AI Agent Workspace - State/Zone Mapping

Single source of truth for how agents move across zones in the current multi-agent implementation.

## State -> Zone

| State | Zone |
| --- | --- |
| `IDLE` | `ROUNDTABLE` |
| `THINKING` | `ROUNDTABLE` |
| `PLANNING` | `ROUNDTABLE` |
| `AWAITING_APPROVAL` | `ROUNDTABLE` |
| `READING` | `LIBRARY` |
| `REVIEWING` | `LIBRARY` |
| `WRITING` | `WORKSHOP` |
| `EXECUTING` | `PROVING_GROUNDS` |
| `TESTING` | `PROVING_GROUNDS` |
| `ERROR` | `PROVING_GROUNDS` |
| `DONE` | `REST_AREA` |
| `SUCCESS` | `REST_AREA` |

## Tool -> State

| Tool | State |
| --- | --- |
| `read_file`, `search_files`, `list_files`, `glob_files` | `READING` |
| `write_file`, `edit_file`, `apply_patch` | `WRITING` |
| `run_command`, `execute_parallel` | `EXECUTING` |
| `ask_user_question` | `AWAITING_APPROVAL` |
| `create_plan` | `PLANNING` |
| other tools | `THINKING` (`default`) |

## Movement Rules

- Primary and sub-agents use the same `assignZonePosition(...)` rule in `App.tsx`.
- Sub-agent state updates are applied through `updateSubAgentState(...)`, which reassigns zone on state change.
- New sub-agents do a short spawn animation first, then automatically move to the zone of their current state.
- During cleanup absorption (`DONE` -> pull to parent), normal zone movement is suspended.

## Consistency Notes

- Keep mappings aligned across:
  - `src/App.tsx` (`assignZonePosition`)
  - `src/agent/types.ts` (`TOOL_TO_STATE`, `STATE_TO_ZONE`)
  - `src/agent/AgentBridge.ts` and `src/agent/gameIntegration.ts` (must consume `types.ts` mappings)
