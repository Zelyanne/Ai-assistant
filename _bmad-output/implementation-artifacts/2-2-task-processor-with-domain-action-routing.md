# Story 2.2: Task Processor with Domain.Action Routing

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Developer,
I want a task processor that routes tasks based on the `domain.action` naming pattern,
so that different task types (email.draft, calendar.create, system.analyze) are handled by appropriate processors.

## Acceptance Criteria

1. [x] **Routing Logic**: The Agent Controller identifies the `domain.action` from the task and routes it to the corresponding processor.
2. [x] **Standard Processor Interface**: All processors implement a standard interface (e.g., `process(task: Task): Promise<any>`).
3. [x] **Supported Domains**:
   - `email.draft`: Routes to `EmailDraftProcessor`.
   - `calendar.create`: Routes to `CalendarCreateProcessor`.
   - `system.analyze`: Routes to `SystemAnalyzeProcessor`.
4. [x] **Error Handling**: Unsupported task types result in a task status of `error` with a descriptive error message in the `result` field.
5. [x] [x] **LangGraph Integration**: The routing is implemented as a conditional edge or a `Command` within the LangGraph workflow.
6. [x] **Audit Trail**: The router and individual processors log their actions to `agent_activity_log` using the established patterns.

## Tasks / Subtasks

- [x] **Core Routing Infrastructure**
  - [x] Define `BaseProcessor` abstract class or interface in `apps/agent/src/processors/BaseProcessor.ts`.
  - [x] Implement `ProcessorRegistry` or dynamic routing logic in `apps/agent/src/controller/graph.ts`.
- [x] **Individual Processors**
  - [x] Create `EmailDraftProcessor.ts` (stub implementation).
  - [x] Create `CalendarCreateProcessor.ts` (stub implementation).
  - [x] Create `SystemAnalyzeProcessor.ts` (migrate current Mistral logic here).
- [x] **Graph Refactoring**
  - [x] Update the LangGraph to include nodes for each processor.
  - [x] Implement conditional routing after the `initialize` node.
- [x] **Validation & Testing**
  - [x] Verify routing with different task types.
  - [x] Ensure `error` status for unknown domains.
  - [x] Add unit tests for the router and processors.

## Dev Notes

### Technical Stack
- **Routing Pattern**: `domain.action` (e.g., `email.draft`)
- **State Management**: LangGraph.js `Command` or `addConditionalEdges`
- **PII Protection**: All processors MUST use `PerimeterGuard` before LLM interactions.

### Architecture Compliance
- **File Structure**: New processors go in `apps/agent/src/processors/`.
- **Naming**: `camelCase` for processors, `snake_case` for DB updates.
- **Shared Types**: Use `Task` and `AgentActivityLog` from `@ai-assistant/shared`.

### Project Structure Notes
- **Processors Directory**: `apps/agent/src/processors/`
- **Main Graph**: `apps/agent/src/controller/graph.ts`

### References
- [Source: _bmad-output/planning-artifacts/architecture.md#Communication Patterns]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2]
- [Source: apps/agent/src/controller/graph.ts] (Current implementation)

## Dev Agent Record

### Agent Model Used

Antigravity (Claude 3.5 Sonnet via BMAD)

### Debug Log References

- Tests run using `npx pnpm --filter @ai-assistant/agent test`
- Processor routing verified for `email.draft`, `calendar.create`, `system.analyze`, and `unknown.action`.

### Completion Notes List

- Implemented `BaseProcessor` abstract class.
- Created `ProcessorRegistry` for centralized processor management.
- Implemented `EmailDraftProcessor`, `CalendarCreateProcessor` (stubs), and `SystemAnalyzeProcessor` (Mistral integration).
- Refactored `graph.ts` to use conditional edges and dedicated nodes for each processor.
- Added comprehensive unit tests for routing and error handling in `graph.spec.ts`.
- Ensured all processors log to `agent_activity_log`.

### File List

- `apps/agent/src/processors/BaseProcessor.ts`
- `apps/agent/src/processors/BaseProcessor.spec.ts`
- `apps/agent/src/processors/EmailDraftProcessor.ts`
- `apps/agent/src/processors/CalendarCreateProcessor.ts`
- `apps/agent/src/processors/SystemAnalyzeProcessor.ts`
- `apps/agent/src/processors/SystemAnalyzeProcessor.spec.ts`
- `apps/agent/src/processors/ProcessorRegistry.ts`
- `apps/agent/src/controller/graph.ts`
- `apps/agent/src/controller/graph.spec.ts`

## Change Log

- 2026-01-17: Initial implementation of domain.action routing logic and processors.
- 2026-01-17: Refactored LangGraph to use specific nodes for each processor.
- 2026-01-17: Added audit logging to all processors.
- 2026-01-17: Fixed code review findings: Added SystemAnalyzeProcessor tests, improved BaseProcessor typing, refactored routing logic.
