# Story 2.1: Agent Controller Initialization & LangGraph Foundation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a System Architect,
I want a Node.js Agent Controller that utilizes LangGraph for state management and listens to the Supabase `tasks` table via Realtime,
so that the agent can process high-agency tasks with structured reasoning and resilient state transitions.

## Acceptance Criteria

1. **Agent Controller Bootstrap**: The `apps/agent` service initializes correctly with `langgraph` and `@langchain/core`.
2. **Secure Connectivity**: Connects to Supabase using a secure `SERVICE_ROLE` key and initializes LLM providers (Mistral AI) via SDK.
3. **Realtime Subscription**: The agent establishes a Realtime subscription to the `tasks` table, monitoring for `INSERT` events where `status = 'queued'`.
4. **LangGraph State Machine**:
   - A base LangGraph `StateGraph` is defined to manage the task lifecycle.
   - The graph includes at least three nodes: `initialize`, `process`, and `finalize`.
5. **Status Lifecycle Management**:
   - The `initialize` node updates the Supabase task status to `processing`.
   - The `finalize` node updates the status to `done` or `error` and writes the result to the JSONB `result` field.
6. **Graceful Shutdown**: The agent handles SIGTERM/SIGINT signals to close the Realtime subscription and database connections cleanly.

## Tasks / Subtasks

- [x] **Service Configuration**
  - [x] Add dependencies: `@langchain/langgraph`, `@langchain/core`, `@supabase/supabase-js`.
  - [x] Set up environment variable validation in `apps/agent/src/config/index.ts` (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LLM API keys).
  - [x] Initialize the Supabase Admin client in `apps/agent/src/services/supabase.ts`.

- [x] **LangGraph Implementation**
  - [x] Define the `AgentState` interface in `apps/agent/src/controller/graph.ts`.
  - [x] Implement the `initializeTask` node (DB update: queued -> processing).
  - [x] Implement the `finalizeTask` node (DB update: processing -> done/error).
  - [x] Assemble the `StateGraph` and compile it.

- [x] **Realtime Integration**
  - [x] Implement the `TaskSubscriber` in `apps/agent/src/index.ts`.
  - [x] Configure the channel to filter for `public:tasks`.
  - [x] Implement the `onInsert` handler to trigger the LangGraph execution for each new task.

- [x] **Observability & Resilience**
  - [x] Add structured logging for graph state transitions.
  - [x] Implement basic error handling within the graph to ensure the task status is always updated (no "stuck" tasks).
  - [x] Implement a basic health check endpoint for the Hetzner deployment.

## Dev Notes

### Technical Stack
- **Runtime**: Node.js (TypeScript)
- **State Management**: LangGraph.js
- **Orchestration**: LangChain
- **BaaS**: Supabase (Realtime & REST)

### Architecture Compliance
- **Monorepo**: All types MUST be imported from `@ai-assistant/shared`.
- **Snake Case**: Database updates must use `snake_case` for column names.
- **Service Role**: Ensure the `SERVICE_ROLE` key is NEVER exposed to the frontend.

### Project Structure Notes
- **Controller Entry**: `apps/agent/src/index.ts`
- **Graph Definition**: `apps/agent/src/controller/graph.ts`
- **Shared Schemas**: Use `TaskSchema` from `packages/shared/src/schemas.ts` for validation.

### References
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1]
- [LangGraph.js Documentation](https://langchain-ai.github.io/langgraphjs/)

## Dev Agent Record

### Agent Model Used

Antigravity (Developer Agent Persona: Amelia)

### Debug Log References

- [2026-01-17] Initialized Agent Controller with LangGraph foundation.
- [2026-01-17] Added dependencies: @langchain/langgraph, @langchain/core, @supabase/supabase-js, @langchain/openai, @langchain/anthropic, zod.
- [2026-01-17] Created config/index.ts with Zod validation.
- [2026-01-17] Implemented StateGraph in controller/graph.ts with initialize, process, and finalize nodes.
- [2026-01-17] Integrated Realtime subscription in index.ts for 'queued' tasks.
- [2026-01-17] Added graceful shutdown and health check endpoint.
- [2026-01-17] Verified implementation with unit tests in graph.spec.ts.
- [2026-01-17] (Code Review Fix) Refactored `processTask` node to use **Mistral AI** instead of OpenAI/Anthropic.
- [2026-01-17] (Code Review Fix) Integrated `PerimeterGuard` for PII redaction and audit logging.
- [2026-01-17] (Code Review Fix) Removed dead code `AgencyController.ts` and updated tests.

### Completion Notes List

- [x] Service successfully listens to Supabase tasks and processes them through LangGraph.
- [x] Status transitions (queued -> processing -> done/error) are verified.
- [x] Environment variables are strictly validated on startup.
- [x] Graceful shutdown ensures clean disconnection from Supabase.
- [x] **Mistral AI** is integrated for LLM processing with PII redaction (PerimeterGuard).

### File List

- `apps/agent/src/index.ts`
- `apps/agent/src/config/index.ts`
- `apps/agent/src/services/supabase.ts`
- `apps/agent/src/controller/graph.ts`
- `apps/agent/src/controller/graph.spec.ts`
- `apps/agent/src/guards/PerimeterGuard.ts`

### Change Log

- [2026-01-17] Created Story 2.1 with LangGraph integration requirements.
- [2026-01-17] Implemented all tasks and verified with tests. Ready for review.
- [2026-01-17] **Code Review**: Refactored to use Mistral AI, fixed missing PII redaction, removed dead code, and passed all tests. Story marked as DONE.
