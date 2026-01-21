# Story 2.5: LLM Reasoning Integration (Mistral AI)

Status: review

## Story
As a Developer,
I want to integrate the Mistral AI SDK into the Agent Controller,
So that the system can perform advanced reasoning, semantic classification, and summarization with structured outputs (FR17, FR18, FR29).

## Acceptance Criteria
- [x] **Mistral Integration**: The system can successfully authenticate and send requests to the Mistral API.
- [x] **Structured Output**: The system allows defining Zod schemas for expected LLM outputs and validates responses against them.
- [x] **Reasoning Node**: A dedicated LangGraph node exists for generic reasoning tasks (`system.analyze`).
- [x] **Logging**: All LLM interactions (prompt, response, token usage, latency) are logged to the `agent_activity_log` table.
- [x] **Error Handling**: API failures or validation errors are caught and returned gracefully.
- [x] **Type Safety**: No `any` types used for LLM payloads; strict Zod validation enforced.

## Tasks
- [x] Install `mistralai` SDK and configure environment variables.
- [x] Create `LLMProvider` interface and `MistralProvider` implementation.
- [x] Implement `generateStructured` method with Zod validation.
- [x] Create `reasoningNode` in LangGraph for `system.analyze`.
- [x] detailed logging to Supabase `agent_activity_log`.
- [x] Add unit tests for the provider and node.
- [x] **[AI-Review][Critical]** Fix fake validation: Replace `z.any()` with real schema registry in `reasoningNode`.
- [x] **[AI-Review][High]** Add tests for `generateStructured` flow.

## Dev Agent Record

### Implementation Plan
- Implemented a provider-based LLM service layer to abstract different LLM vendors.
- Integrated the official `mistralai` SDK for high-performance reasoning.
- Created a `reasoningNode` in LangGraph to handle LLM interactions, including structured output validation via Zod and activity logging to Supabase.
- Updated the main graph routing to use the `reasoning` node for `system.analyze` tasks.

### Completion Notes
- **LLM Provider**: `MistralProvider` implemented with `generateStructured` and `generateText` capabilities.
- **Factory Pattern**: `LLMProviderFactory` allows easy switching or expansion of providers.
- **LangGraph**: `reasoning` node added to `graph.ts`, replacing the old processor-based approach for analysis.
- **Logging**: All LLM calls are logged to `agent_activity_log` with token usage and latency.
- **Type Safety**: Full Zod integration for structured output.
- **Fixes Applied**: Replaced unsafe `z.any()` validation with a `SCHEMA_REGISTRY` that maps `schemaKey` to actual Zod schemas from `@ai-assistant/shared`. Added missing tests.

## File List
- `package.json` (Modified)
- `apps/agent/package.json` (Modified)
- `apps/agent/src/services/llm/types.ts` (New)
- `apps/agent/src/services/llm/mistral.ts` (New)
- `apps/agent/src/services/llm/mistral.spec.ts` (New)
- `apps/agent/src/services/llm/factory.ts` (New)
- `apps/agent/src/controller/nodes/reasoning.ts` (New)
- `apps/agent/src/controller/nodes/reasoning.spec.ts` (New)
- `apps/agent/src/controller/graph.ts` (Modified)
- `apps/agent/src/controller/graph.spec.ts` (Modified)
- `apps/agent/src/config/index.ts` (Modified)
- `apps/agent/.env.example` (New)

## Change Log
- [2026-01-18] Initial implementation of Mistral AI reasoning integration.
- [2026-01-18] Added reasoning node to LangGraph and updated routing.
- [2026-01-18] Added comprehensive unit and integration tests.
- [2026-01-18] [AI-Review] Fixed Critical validation issue and updated file list.

## Status: done


### Architecture Compliance
- **Isolation**: PII filtering via `PerimeterGuard` (Story 2.4) MUST happen *before* the LLM service is called.
- **Type Safety**: All LLM outputs must be validated against Zod schemas shared in `packages/shared`.
- **Async Pattern**: LLM calls are asynchronous; ensure proper `await` handling.

### Previous Story Intelligence (Story 2.4)
- **Learnings**: The `check_perimeter` node (Story 2.4) processes the payload. The `reasoning` node MUST accept this *redacted* payload.
- **Service Pattern**: Extend the existing Service pattern (`apps/agent/src/services/`) for consistency.

### Library & Framework Requirements
- **Mistral SDK**: Ensure usage of the latest JS SDK. Handle potential differences in "function calling" or "JSON mode" vs OpenAI. If native JSON mode is flaky, implement a robust "JSON Repair" utility or use LangChain's output parsers.

### Project Structure
- **Location**: `apps/agent/src/services/llm/`
- **Shared Types**: `packages/shared/src/schemas.ts`

### References
- [Architecture: API & Communication Patterns]
- [Story 2.4: PerimeterGuard Implementation]
