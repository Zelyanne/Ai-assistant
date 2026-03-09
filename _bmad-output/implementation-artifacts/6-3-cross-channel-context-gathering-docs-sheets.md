# Story 6.3: Cross-Channel Context Gathering (Docs/Sheets)

Status: done

Story ID: 6.3
Story Key: 6-3-cross-channel-context-gathering-docs-sheets

Dependencies:
- Story 2.3: MCP SDK integration and multi-tenant Workspace MCP server (`apps/agent/src/services/mcp.ts`).
- Story 2.2: `domain_action` routing via `apps/agent/src/processors/ProcessorRegistry.ts`.
- Story 2.7: Protocol loading + perimeter checks in the LangGraph execution flow.
- Story 6.1: Command Center (`assistant.command`) should be able to consume gathered context when a request references Docs/Sheets.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Developer,
I want the Agent Controller to gather read-only context from Google Docs and Sheets,
so that downstream proxy actions (drafts, summaries, reporting) are informed by the latest project documents with citations.

## Acceptance Criteria

1. **Task can reference Docs/Sheets and request context gathering:**
   **Given** a queued task whose payload references a Google Doc or Google Sheet (URL or file id)
   **When** the Agent Controller processes the task
   **Then** it fetches read-only content from the referenced Doc/Sheet (or via Drive export)
   **And** the fetched content is included in the task's reasoning context and/or returned in the task result.

2. **Context gathering is safe, read-only, and perimeter-aware:**
   **Given** context gathering is performed
   **When** content is retrieved from Google Workspace
   **Then** only read-only operations are used
   **And** content is redacted via `PerimeterGuard` before being logged or returned
   **And** Restricted/perimeter-violating requests follow the existing escalation/paused contracts.

3. **Citations and audit linkage are mandatory:**
   **Given** any Doc/Sheet content is used
   **When** the Agent produces output
   **Then** it includes citations that identify the source (Doc/Sheet URL or file id) and what was extracted
   **And** `agent_activity_log` includes a step that records the context gathering and citations.

4. **Works via the existing database-as-queue orchestration (no parallel pipeline):**
   **Given** the web app submits commands (Story 6.1) and tasks flow through Supabase
   **When** context is needed
   **Then** the Agent gathers it as part of the normal graph/processor flow (task status transitions remain `queued -> processing -> done/error/escalation/paused`).

5. **Reliability and limits:**
   **Given** large documents or slow providers
   **When** context gathering runs
   **Then** it enforces size/time limits, truncates safely, and records truncation metadata
   **And** failures produce deterministic error payloads without crashing the worker.

## Tasks / Subtasks

- [x] Add a context reference contract in shared schemas (AC: 1, 3)
  - [x] Add Zod schema(s) in `packages/shared/src/schemas.ts` for `ContextReference` (Doc/Sheet URLs + file ids) and `ContextItem` (redacted text + citation metadata).
  - [x] Add/extend task payload schema(s) used by `assistant.command` to carry extracted `context_references`.

- [x] Implement a read-only Workspace context fetcher in the Agent (AC: 1, 2, 5)
  - [x] Add `apps/agent/src/services/WorkspaceContextService.ts` (recommended) that can fetch:
    - Google Docs: via Drive export to `text/plain` or `text/html` -> normalize to markdown-ish text.
    - Google Sheets: via Drive export to `text/csv` (or Sheets API if explicitly chosen).
  - [x] Reuse credentials from `workspace_integrations` (same org-scoped integration used by `MCPService`).
  - [x] Apply `PerimeterGuard` redaction to fetched content and to any error details.

- [x] Wire context gathering into the execution flow (AC: 1, 4)
  - [x] Add a graph node (recommended: `loadWorkspaceContext`) executed before the main reasoning/processor step.
  - [x] Ensure downstream processors can access `state.workspace_context_items` (or equivalent) and include them in prompts/results.

- [x] Make command-center tasks able to use it (AC: 1, 4)
  - [x] Update `apps/agent/src/processors/AssistantCommandProcessor.ts` to detect Doc/Sheet URLs in user messages and add `context_references` into the delegated task payload.
  - [x] Ensure only read-only context references are generated (no mutation intent).

- [x] Audit logging + citations (AC: 3)
  - [x] Add an `AuditLogger` step for each fetched reference (include file id/url + truncation metadata).
  - [x] Ensure citations are returned in a consistent format and attached to the task result.

- [x] Tests (AC: 1-5)
  - [x] Unit tests for URL/file-id parsing and export strategy selection.
  - [x] Unit tests for redaction/truncation behavior.
  - [x] Graph/processor integration test: `assistant.command` -> delegated task includes context -> context loader runs -> result includes citations.

## Dev Notes

### Architecture / Patterns to Follow

- Use the existing database-as-queue contract and LangGraph flow; do not introduce direct provider calls from the web app. [Source: _bmad-output/planning-artifacts/architecture.md]
- Keep everything org-scoped using `workspace_integrations` and existing token refresh patterns. [Source: apps/agent/src/services/mcp.ts] [Source: apps/agent/src/services/googleAuth.ts]
- Redact all retrieved content and logging via `PerimeterGuard`. [Source: apps/agent/src/guards/PerimeterGuard.ts]
- Log every context-gather decision with `AuditLogger` and citations. [Source: apps/agent/src/services/AuditLogger.ts]

### Google API Implementation Notes (Context7)

- Drive export is a canonical read-only way to fetch Doc/Sheet content for downstream reasoning:
  - `drive.files.export({ fileId, mimeType }, { responseType })` is the standard pattern. [External Source: Context7 `/websites/googleapis_dev_nodejs_googleapis`]
- For Sheets, prefer exporting to CSV via Drive when possible to avoid expanding OAuth scopes; fall back to Sheets API only if required.

### Supabase Realtime Lifecycle (Context7)

- If any new realtime subscriptions are introduced (e.g., context cache updates), ensure proper cleanup with `channel.unsubscribe()` and `supabase.removeChannel(channel)` in lifecycle hooks. [External Source: Context7 `/supabase/supabase-js`]

### Implementation Guardrails / Known Gaps

- There is currently no existing processor or schema dedicated to Docs/Sheets context gathering; this story should create a single shared mechanism rather than duplicating per-processor logic.
- The reasoning node tool allowlist is prefix-based; do not rely on namespaced tool names like `drive.search_files` unless the allowlist is intentionally extended. [Source: apps/agent/src/controller/nodes/reasoning.ts]

### File Structure Requirements

- Agent:
  - `apps/agent/src/services/WorkspaceContextService.ts` (new)
  - `apps/agent/src/controller/nodes/workspaceContext.ts` (new, if node-based)
  - `apps/agent/src/controller/graph.ts` (wire node)
  - `apps/agent/src/processors/AssistantCommandProcessor.ts` (add context reference extraction)
- Shared:
  - `packages/shared/src/schemas.ts` (new schemas)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.3]
- [Source: _bmad-output/planning-artifacts/architecture.md]
- [Source: _bmad-output/project-context.md]
- [Source: apps/agent/src/services/mcp.ts]
- [Source: apps/agent/src/services/googleAuth.ts]
- [Source: apps/agent/src/controller/nodes/reasoning.ts]
- [External Source: Context7 `/websites/googleapis_dev_nodejs_googleapis`]
- [External Source: Context7 `/supabase/supabase-js`]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.2

### Implementation Plan

- Define minimal shared contracts (`ContextReference`, `WorkspaceContextItem`) and thread them through task payloads/results.
- Implement `WorkspaceContextService` using Drive export (Doc -> text/plain; Sheet -> text/csv) with strict size/time limits and `PerimeterGuard` redaction.
- Add `loadWorkspaceContext` as a graph node before reasoning/processor steps; attach `workspace_context_items` to state.
- Extend `AssistantCommandProcessor` to detect Google Doc/Sheet URLs and emit `context_references` for downstream tasks.
- Add tests covering parsing, truncation, redaction, and end-to-end graph linkage with citations.

### Debug Log References

- Context7 used:
  - Supabase realtime subscribe/unsubscribe and cleanup patterns. [External Source: Context7 `/supabase/supabase-js`]
  - Google APIs Node patterns for `drive.files.export` to retrieve Doc content. [External Source: Context7 `/websites/googleapis_dev_nodejs_googleapis`]
  - MCP TS client patterns for `listTools`/`callTool` to validate result shapes and tool discovery. [External Source: Context7 `/modelcontextprotocol/typescript-sdk`]

### Completion Notes List

- Story authored to avoid expanding tool-enabled reasoning allowlist (prefix-only) and to keep context gathering in explicit service/node logic. [Source: apps/agent/src/controller/nodes/reasoning.ts]
- Drive read-only scope is already present in auth service; story avoids requiring broader scopes unless later needed. [Source: apps/agent/src/services/googleAuth.ts]
- Implemented `WorkspaceContextService` with token refresh and `drive.files.export`.
- Added `load_workspace_context` node to graph and updated reasoning node to consume injected context.
- Enhanced `AssistantCommandProcessor` with regex URL extraction.
- Cleaned up generated `.js` artifacts in `apps/web/src` and fixed async test timing in `useCommandCenter.spec.ts`.

### File List

- `_bmad-output/implementation-artifacts/6-3-cross-channel-context-gathering-docs-sheets.md`
- `packages/shared/src/schemas.ts`
- `apps/agent/src/services/WorkspaceContextService.ts`
- `apps/agent/src/services/WorkspaceContextService.spec.ts`
- `apps/agent/src/controller/nodes/workspaceContext.ts`
- `apps/agent/src/controller/graph.ts`
- `apps/agent/src/controller/graph.workspaceContext.spec.ts`
- `apps/agent/src/processors/AssistantCommandProcessor.ts`
- `apps/agent/src/controller/nodes/reasoning.ts`
- `apps/web/src/composables/useCommandCenter.spec.ts`

### Change Log

- 2026-03-09: Implemented Story 6.3 Cross-Channel Context Gathering (Docs/Sheets) with read-only extraction, redaction, graph integration, and comprehensive tests. Moved to `done`.
