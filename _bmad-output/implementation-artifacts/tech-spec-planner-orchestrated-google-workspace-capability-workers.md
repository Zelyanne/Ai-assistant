---
title: 'Planner-Orchestrated Google Workspace Capability Workers'
slug: 'planner-orchestrated-google-workspace-capability-workers'
created: '2026-03-12'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4, 5]
tech_stack: ['Node.js', 'TypeScript', 'LangGraph', 'LangChain', '@modelcontextprotocol/sdk', '@langchain/mcp-adapters', 'Supabase', 'Google OAuth2', 'workspace-mcp v1.14.2']
files_to_modify:
  - 'apps/agent/src/controller/graph.ts'
  - 'apps/agent/src/controller/graph.spec.ts'
  - 'apps/agent/src/controller/nodes/planner.ts'
  - 'apps/agent/src/controller/nodes/workspaceContext.ts'
  - 'apps/agent/src/processors/AssistantCommandProcessor.ts'
  - 'apps/agent/src/processors/AssistantCommandProcessor.spec.ts'
  - 'apps/agent/src/processors/ProcessorRegistry.ts'
  - 'apps/agent/src/processors/CalendarCreateProcessor.ts'
  - 'apps/agent/src/processors/CalendarCreateProcessor.spec.ts'
  - 'apps/agent/src/processors/EmailDraftProcessor.ts'
  - 'apps/agent/src/processors/EmailDraftProcessor.spec.ts'
  - 'apps/agent/src/processors/EmailSendProcessor.ts'
  - 'apps/agent/src/processors/EmailSendProcessor.spec.ts'
  - 'apps/agent/src/services/mcp.ts'
  - 'apps/agent/src/services/mcp.spec.ts'
  - 'apps/agent/src/services/AuditLogger.ts'
  - 'apps/agent/src/services/taskSubscriber.ts'
  - 'apps/agent/src/services/taskSubscriber.spec.ts'
  - 'apps/agent/src/services/googleAuth.ts'
  - 'apps/agent/src/services/ExecutionRunService.ts'
  - 'apps/agent/src/services/ExecutionRunService.spec.ts'
  - 'apps/agent/src/services/WorkerToolPolicyService.ts'
  - 'apps/agent/src/workers/CapabilityWorkerRegistry.ts'
  - 'packages/shared/src/schemas.ts'
  - 'packages/shared/src/database.types.ts'
  - 'supabase/migrations/20260312113000_create_execution_runs.sql'
code_patterns: ['Supabase database-as-queue on public.tasks', 'LangGraph state machine with conditional routing and task finalization', 'ProcessorRegistry keyed by domain_action', 'Shared org-scoped MCP client/tool cache in MCPService', 'Immutable agent_activity_log via AuditLogger', 'Command Center conversations stored separately from tasks', 'Direct Google API ingestion exists alongside MCP orchestration', 'Capability-worker layer is a confirmed clean slate']
test_patterns: ['Vitest unit tests adjacent to agent code', 'Graph routing/integration coverage in apps/agent/src/controller/graph.spec.ts', 'MCP service contract coverage in apps/agent/src/services/mcp*.spec.ts', 'Processor-specific specs for task behavior and escalation paths']
---

# Tech-Spec: Planner-Orchestrated Google Workspace Capability Workers

**Created:** 2026-03-12

## Overview

### Problem Statement

The current agent runtime is graph-centric and processor-driven, but it does not match the intended operating model of a general planner coordinating capability-scoped agents. Requests can be delegated once from `assistant.command` to another `domain_action`, but the system does not persist a multi-step execution plan, enforce strict worker-level tool boundaries for Google Workspace services, or maintain an explicit handoff record that lets one worker leave status and notes for the next worker in the chain.

This gap matters for compound requests such as reading a document from Drive, generating a derived artifact in Google Docs, and then sending the result through Gmail. Today, the runtime is organized around a shared MCP tool surface and a processor registry, which means the architecture behaves like a single orchestrator with broad capabilities rather than a planner directing specialized workers with bounded capabilities and visible inter-step state.

### Solution

Introduce a planner-led orchestration layer that turns `assistant.command` requests into persisted execution plans made of ordered worker steps. Each step is assigned to a capability worker such as Drive, Docs, Gmail, Sheets, Slides, or Calendar, with strict MCP tool allowlists enforced per worker while still reusing the shared MCP transport.

Add a dedicated execution-run ledger stored as a single persisted request document per task. Each worker updates structured metadata plus a human-readable markdown ledger containing plan state, current step, outputs, and handoff notes for the next worker. The planner should support one automatic re-plan for recoverable failures and escalate when the plan cannot continue safely.

### Scope

**In Scope:**
- Rework `assistant.command` into a planning entrypoint that produces a persisted multi-step execution plan.
- Add a planner/worker orchestration model for Google Workspace capability workers only in v1.
- Add dedicated persistence for one execution-run record per request, combining structured plan metadata with an updated markdown ledger.
- Enforce strict per-worker MCP tool allowlists while keeping the shared MCP transport.
- Integrate automatic re-plan-once behavior for recoverable worker failures.
- Align existing graph routing, processor execution, and audit logging with the new orchestration flow.
- Resolve current architecture drift where workspace context orchestration is wired in the graph but still stubbed in implementation.

**Out of Scope:**
- Non-Google capability workers in v1.
- Frontend redesign beyond what is needed to surface orchestration status.
- Replacing the shared MCP transport with separate MCP servers per worker.
- Unrelated cleanup in messaging, relancing, or morning brief flows.

## Context for Development

### Codebase Patterns

- **Single Task, Single Graph Run:** `apps/agent/src/services/taskSubscriber.ts` invokes one LangGraph run per queued task; there is no persisted child-step fan-out today.
- **Graph Lifecycle Contract:** `apps/agent/src/controller/graph.ts` owns emergency brake, initialization, protocol loading, perimeter checks, workspace context, routing, and finalization.
- **One-Hop Delegation Only:** `assistant.command` rewrites the current task into one delegated `domain_action`; it does not persist or execute a multi-step plan.
- **Processor-Centric Execution:** `ProcessorRegistry` resolves `domain_action` values to processors, and processors call MCP tools directly or by dynamic name matching.
- **Shared MCP Surface:** `MCPService` caches one org-scoped client and tool list; worker-level capability boundaries do not exist yet.
- **Task Finalization by JSON Merge:** `finalizeTask` merges `tasks.result` with the latest DB state, which is useful for single-task outcomes but insufficient for a long-lived execution ledger that multiple worker steps update.
- **Separate Conversation Model Exists:** `command_conversations` and `command_messages` already provide a pattern for storing orchestration-adjacent state outside `tasks`.
- **Immutable Audit Trail:** `agent_activity_log` is append-only and good for reasoning/citations, but it is not a structured next-worker handoff store.
- **Direct Google API Side Path:** `apps/agent/src/services/google.ts` still performs background Gmail/Calendar ingestion outside MCP, so the planner-worker refactor must not break that path.
- **Confirmed Clean Slate for Workers:** There is no existing worker registry, execution-plan ledger, or handoff-note model to preserve.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/agent/src/controller/graph.ts` | Current orchestration graph, one-hop delegation behavior, and finalization contract |
| `apps/agent/src/controller/graph.spec.ts` | Existing graph tests that will need planner/worker coverage updates |
| `apps/agent/src/controller/nodes/reasoning.ts` | Existing reasoning node and current read-only tool gating pattern |
| `apps/agent/src/controller/nodes/workspaceContext.ts` | Stubbed node already wired into the graph; clear sign of implementation drift |
| `apps/agent/src/processors/AssistantCommandProcessor.ts` | Natural-language command parsing and current delegation entrypoint |
| `apps/agent/src/processors/ProcessorRegistry.ts` | Current routing registry standing in for worker selection |
| `apps/agent/src/processors/CalendarCreateProcessor.ts` | Current dynamic tool-name matching for calendar actions |
| `apps/agent/src/processors/EmailDraftProcessor.ts` | Current hard-coded Gmail draft tool invocation |
| `apps/agent/src/processors/EmailSendProcessor.ts` | Current hard-coded Gmail send/draft fallback flow |
| `apps/agent/src/services/mcp.ts` | Shared MCP transport, auth, tool discovery, and execution layer |
| `apps/agent/src/services/AuditLogger.ts` | Immutable audit logging contract to preserve alongside a new handoff ledger |
| `apps/agent/src/services/taskSubscriber.ts` | Current single task subscriber entrypoint |
| `apps/agent/src/services/googleAuth.ts` | Current Google OAuth scope envelope |
| `apps/agent/src/services/google.ts` | Non-MCP Google ingestion service that coexists with the orchestration runtime |
| `packages/shared/src/schemas.ts` | Shared task, audit, command center, and context schemas |
| `supabase/migrations/20260114000000_core_and_domain_schema.sql` | Base `tasks`, `agent_activity_log`, and integration tables |
| `supabase/migrations/20260309100000_create_command_center_conversations.sql` | Pattern for storing long-lived markdown-backed state outside `tasks` |
| `supabase/migrations/20260309220000_audit_log_improvements.sql` | Current audit log shape and agent identifier rules |
| `_bmad-output/planning-artifacts/architecture.md` | Original queue-driven architecture assumptions |
| `_bmad-output/project-context.md` | Project-wide coding, testing, and safety rules |

### Technical Decisions

- Keep the shared MCP server and org-scoped auth flow, but enforce strict tool allowlists at the worker layer.
- Add one dedicated `execution_runs` persistence record instead of overloading `tasks.result` and `agent_activity_log` with plan state.
- Treat the planner as the only component allowed to create or re-plan multi-step execution graphs.
- Model worker execution as sequential plan steps in v1; parallel fan-out can remain future work.
- Require every worker step to update both structured execution fields and a markdown ledger entry for downstream workers.
- Allow one automatic re-plan for recoverable failures, then escalate through the existing human-review pathway.
- Preserve perimeter enforcement and confidence gating before any side-effecting step is executed.
- External repo investigation confirms the upstream MCP package is `workspace-mcp` v1.14.2 from `taylorwilsdon/google_workspace_mcp`.
- The upstream repo is already capability-partitioned by service (`gmail`, `gdrive`, `gdocs`, `gsheets`, `gslides`, `gcalendar`), which maps cleanly to the proposed worker model.
- Upstream `core/tool_tiers.yaml` is a strong seed source for worker allowlists and read/write boundaries.
- Local tool assumptions have drifted from upstream naming: local code expects names like `create_gmail_draft`, `create_calendar_event`, and `query_calendar_freebusy`, while the current upstream surface exposes names like `draft_gmail_message`, `manage_event`, and `query_freebusy`.
- Current OAuth scopes in `apps/agent/src/services/googleAuth.ts` only cover Gmail, Calendar, Drive read-only, and user info, so Docs/Sheets/Slides workers and Drive write flows cannot be fully enabled without auth expansion.
- Context7 MCP SDK guidance supports reusing one `StreamableHTTPClientTransport` client connection and constraining accessible tools in the application layer rather than forcing one transport per worker.
- Context7 LangGraph guidance confirms a supervisor/orchestrator-worker pattern is a valid fit, but the current graph state model must be expanded to persist execution state durably.
- For v1, use a lean persistence model: one `execution_runs` row per root task with `plan_json`, `ledger_markdown`, `status`, `current_step_key`, `current_worker_type`, `tool_policy_version`, `idempotency_state`, and `version` for optimistic locking.
- The markdown ledger is the primary human-readable handoff artifact; structured columns remain the source for routing, locking, and querying.
- `plan_json` is the execution truth for routing and resume logic; `ledger_markdown` is the human-facing operational handoff and must never be parsed as the source of execution truth.
- Every worker commit must update `plan_json`, `ledger_markdown`, `status`, `current_step_key`, `idempotency_state`, and `version` in one atomic write boundary.
- `ledger_markdown` should be generated from a typed template so every step records worker, action, input summary, outputs/artifacts, next-worker note, attempt number, and timestamp in a stable format.
- Capability readiness preflight must run before planning and re-planning to verify tool availability, worker policy allowance, active integration, and required Google scopes.
- Side-effecting steps must carry stable idempotency keys so retries and re-plans do not duplicate sends, document creation, imports, or calendar mutations.
- Raw sensitive payloads should stay in structured storage or referenced artifacts; `ledger_markdown` should contain redacted summaries only.
- If later analytics or concurrency needs outgrow the single-row model, step tables can be introduced as a follow-up without changing the planner/worker contract.

## Implementation Plan

### Tasks

- [x] Task 1: Add execution-run persistence and shared schemas
  - File: `supabase/migrations/<new_execution_runs_table>.sql`
  - Action: Create an `execution_runs` table keyed to the root `tasks` row with columns for `task_id`, `organization_id`, `status`, `plan_json`, `ledger_markdown`, `current_step_key`, `current_worker_type`, `tool_policy_version`, `idempotency_state`, `version`, `last_error`, `created_at`, and `updated_at`.
  - Notes: Add indexes for `task_id`, `organization_id`, and `status`; add RLS rules aligned with existing task visibility; keep one row per root request.
  - File: `packages/shared/src/schemas.ts`
  - Action: Add typed schemas for execution runs, embedded plan steps, ledger entries, capability readiness results, and idempotency state.
  - Notes: Make `plan_json` the routing contract and the markdown ledger a separate typed rendering target.

- [x] Task 2: Implement execution-run service with atomic update helpers
  - File: `apps/agent/src/services/ExecutionRunService.ts`
  - Action: Create a service for creating execution runs, reading current state, applying optimistic-locking updates, appending typed ledger entries, and recording re-plan metadata.
  - Notes: Every update must atomically persist `plan_json`, `ledger_markdown`, `status`, `current_step_key`, `idempotency_state`, and increment `version`.
  - File: `apps/agent/src/services/AuditLogger.ts`
  - Action: Add correlation hooks so audit events can reference `execution_run_id` or `task_id` without turning the audit log into orchestration state.
  - Notes: Preserve append-only behavior.

- [x] Task 3: Add worker tool policy and upstream tool normalization
  - File: `apps/agent/src/services/WorkerToolPolicyService.ts`
  - Action: Implement deny-by-default worker tool policies seeded from Taylor MCP capability tiers and local overrides.
  - Notes: Include worker types for `gmail`, `drive`, `docs`, `sheets`, `slides`, and `calendar`; persist a policy version string into execution runs.
  - File: `apps/agent/src/services/mcp.ts`
  - Action: Add helpers to expose available tool names, normalize local aliases to upstream tool names, and execute only allowed tools for a given worker policy.
  - Notes: Normalize local names like `create_gmail_draft` -> `draft_gmail_message` and `create_calendar_event`/`query_calendar_freebusy` -> `manage_event`/`query_freebusy`.

- [x] Task 4: Expand Google capability readiness and scope support
  - File: `apps/agent/src/services/googleAuth.ts`
  - Action: Expand OAuth scopes to cover Docs, Sheets, Slides, and required Drive write/import actions used by planner workers.
  - Notes: Keep scope definitions explicit and grouped by capability; document that existing orgs may need re-consent.
  - File: `apps/agent/src/services/mcp.ts`
  - Action: Add capability readiness checks that verify active integration, required scopes, reachable MCP tool, and worker policy approval before planning or step execution.
  - Notes: Return structured preflight failures that the planner can use to block or re-plan.

- [x] Task 5: Introduce planner node and capability worker registry
  - File: `apps/agent/src/controller/nodes/planner.ts`
  - Action: Implement a planner node that turns `assistant.command` intent into ordered execution steps with worker assignments, idempotency keys, and re-plan metadata.
  - Notes: Sequential steps only in v1; include worker notes and artifact expectations per step.
  - File: `apps/agent/src/workers/CapabilityWorkerRegistry.ts`
  - Action: Add a registry mapping worker types to execution handlers and allowed action shapes.
  - Notes: This is the new worker-selection layer and should not depend on legacy `domain_action` naming.
  - File: `apps/agent/src/processors/ProcessorRegistry.ts`
  - Action: Update routing so `assistant.command` enters the planner/worker flow while legacy direct processors can coexist during migration.
  - Notes: Keep non-planner domain actions working until migration is complete.

- [x] Task 6: Refactor assistant command flow to create execution runs instead of one-hop delegation
  - File: `apps/agent/src/processors/AssistantCommandProcessor.ts`
  - Action: Change command processing to emit planner-ready structured intent and create or attach to an `execution_run` rather than rewriting directly to a delegated `domain_action` only.
  - Notes: Preserve existing confidence/perimeter checks and conversation context input.
  - File: `apps/agent/src/controller/graph.ts`
  - Action: Replace one-hop delegation flow with planner invocation, current-step execution, execution-run updates, and sequential worker advancement.
  - Notes: Root `tasks` row remains the outer request envelope while execution progress lives in `execution_runs`.

- [x] Task 7: Implement sequential worker execution with typed markdown ledger updates
  - File: `apps/agent/src/controller/graph.ts`
  - Action: Add graph logic for selecting the current plan step, dispatching the worker, applying atomic execution-run updates, and resuming until completion or escalation.
  - Notes: Routing must use `plan_json` only; `ledger_markdown` is rendered for humans and debugging.
  - File: `apps/agent/src/controller/nodes/workspaceContext.ts`
  - Action: Replace the stub with logic that can read execution-run artifacts or handoff context when a request depends on prior workspace retrieval.
  - Notes: Use structured step outputs rather than parsing markdown for execution decisions.
  - File: `apps/agent/src/services/taskSubscriber.ts`
  - Action: Ensure queued tasks resume the correct execution-run state rather than assuming a single-pass graph execution.
  - Notes: Maintain current queue semantics while allowing multi-step progression.

- [x] Task 8: Migrate Gmail and Calendar processors behind worker policies and normalized tools
  - File: `apps/agent/src/processors/EmailDraftProcessor.ts`
  - Action: Replace hard-coded direct tool execution with worker-policy-aware calls and normalized tool names.
  - Notes: Preserve draft creation behavior while emitting structured artifacts for downstream workers.
  - File: `apps/agent/src/processors/EmailSendProcessor.ts`
  - Action: Update send/draft fallback logic to use idempotency state and normalized Gmail tool contracts.
  - Notes: Prevent duplicate sends on retry or re-plan.
  - File: `apps/agent/src/processors/CalendarCreateProcessor.ts`
  - Action: Update dynamic calendar tool selection to resolve through normalized upstream names and worker policies.
  - Notes: Preserve conflict detection behavior while storing step artifacts and retry-safe mutation identifiers.

- [x] Task 9: Add completion, escalation, and failure-recovery handling
  - File: `apps/agent/src/controller/graph.ts`
  - Action: Implement recoverable failure detection, single automatic re-plan, terminal escalation, and final root-task completion based on execution-run outcome.
  - Notes: Finalization should summarize execution-run artifacts into `tasks.result` without losing detailed plan state in `execution_runs`.
  - File: `apps/agent/src/services/ExecutionRunService.ts`
  - Action: Add helper methods for marking runs complete, failed, escalated, or replanned and for rendering final markdown snapshots.
  - Notes: Keep state transitions explicit and auditable.

- [x] Task 10: Add test coverage for planner-worker orchestration
  - File: `apps/agent/src/controller/graph.spec.ts`
  - Action: Add integration tests covering planner creation, sequential worker execution, atomic state updates, re-plan-once behavior, and escalation.
  - Notes: Cover at least a Drive -> Docs -> Gmail style workflow.
  - File: `apps/agent/src/services/mcp.spec.ts`
  - Action: Add tests for tool normalization, policy enforcement, and capability readiness preflight.
  - Notes: Mock upstream tool lists using the Taylor MCP naming model.
  - File: `apps/agent/src/processors/EmailDraftProcessor.spec.ts`
  - Action: Update tests for normalized Gmail draft execution and idempotent retry behavior.
  - Notes: Assert no duplicate draft/send side effects.
  - File: `apps/agent/src/processors/EmailSendProcessor.spec.ts`
  - Action: Update tests for send fallback, worker policy checks, and duplicate-send prevention.
  - Notes: Include retry/re-plan scenarios.
  - File: `apps/agent/src/processors/CalendarCreateProcessor.spec.ts`
  - Action: Update tests for normalized calendar tools, conflict detection, and idempotent mutation handling.
  - Notes: Include missing-scope and unavailable-tool paths.

### Acceptance Criteria

- [x] AC 1: Given a compound Google Workspace request, when `assistant.command` receives it, then the runtime creates an `execution_runs` record containing an ordered `plan_json` instead of only rewriting the task to one delegated `domain_action`.
- [x] AC 2: Given a planned step assigned to `gmail`, `drive`, `docs`, `sheets`, `slides`, or `calendar`, when the worker executes, then it can call only tools allowed by `WorkerToolPolicyService` for that worker type.
- [x] AC 3: Given local legacy tool aliases such as `create_gmail_draft` or `create_calendar_event`, when a worker resolves a tool call, then the runtime normalizes them to the current Taylor MCP tool names before execution.
- [x] AC 4: Given a worker completes a step, when execution state is persisted, then `plan_json`, `ledger_markdown`, `status`, `current_step_key`, `idempotency_state`, and `version` are updated atomically under optimistic locking.
- [x] AC 5: Given a worker resumes a request after another worker completed its step, when it reads execution state, then it can access the latest structured outputs and the matching markdown handoff note without observing partial updates.
- [x] AC 6: Given the runtime selects the next step to execute, when routing occurs, then `plan_json` rather than `ledger_markdown` is used as the source of execution truth.
- [x] AC 7: Given the planner emits or revises a step that requires Docs, Sheets, Slides, or Drive write access, when capability readiness preflight runs, then missing scopes, inactive integrations, or unavailable tools block that step before execution.
- [x] AC 8: Given a side-effecting Gmail, Docs, Drive, Slides, or Calendar step is retried or revisited by re-plan, when execution resumes, then stable idempotency state prevents duplicate sends, duplicate document creation, duplicate imports, or duplicate event mutations.
- [x] AC 9: Given a worker failure is recoverable, when the planner determines an alternative path exists, then exactly one automatic re-plan is recorded in the execution run and processing continues from the revised plan.
- [x] AC 10: Given a worker failure is non-recoverable or the request becomes ambiguous, when safe continuation is not possible, then the execution run is marked escalated and the root task follows the existing escalation contract.
- [x] AC 11: Given orchestration audit events are written during planning and execution, when logs are stored, then `agent_activity_log` remains append-only and orchestration progress remains in `execution_runs`.
- [x] AC 12: Given a worker writes a ledger entry, when markdown is rendered, then the entry follows the typed template with worker, action, input summary, outputs/artifacts, next-worker note, attempt number, and timestamp.

### Pre-mortem Risks and Mitigations

- **Lost updates:** protect the single execution-run record with optimistic locking on `version` and fail fast on concurrent writes.
- **Partial state drift:** require atomic execution-run updates so routing state and markdown handoff never diverge.
- **Duplicate side effects:** enforce stable idempotency keys for Gmail, Docs, Drive, Slides, and Calendar mutations.
- **Impossible plans:** run capability readiness preflight before initial planning and any re-plan.
- **Markdown drift:** generate `ledger_markdown` from a typed template, not arbitrary worker prose.
- **Security leakage:** redact sensitive content in the markdown ledger and keep raw payloads in structured storage or referenced artifacts.

## Additional Context

### Dependencies

- Supabase task queue and existing task lifecycle contracts.
- LangGraph execution pipeline in `apps/agent/src/controller/graph.ts`.
- Shared MCP transport and Google Workspace OAuth integration.
- Shared schemas in `packages/shared` for execution-run contracts and markdown-ledger structure.
- Existing escalation, perimeter, and confidence-gating logic.
- Taylor Google Workspace MCP upstream tool contracts from `taylorwilsdon/google_workspace_mcp`.
- Expanded Google OAuth consent for Docs, Sheets, Slides, and Drive write/import capabilities.
- Existing `workspace_integrations` records and token refresh pipeline.

### Testing Strategy

- Unit tests for planner output schema, worker allowlist enforcement, and handoff-state transitions.
- Integration tests for compound plan execution across at least Drive -> Docs -> Gmail style sequences.
- Graph tests for re-plan-once behavior, escalation fallbacks, and status persistence.
- Contract tests for audit log writes plus execution-run markdown/metadata updates on every step.
- Manual test: connect a Google integration with expanded scopes, run a request that reads Drive content, creates or updates a Doc, and drafts or sends an email, then verify the execution ledger and final task result.
- Manual test: simulate missing scopes or disabled integrations and verify capability readiness blocks the relevant step before side effects occur.
- Manual test: force a retry on a side-effecting step and verify idempotency prevents duplicate artifacts.

### Notes

- Current implementation already shows architecture drift: the graph expects workspace-context loading, but `apps/agent/src/controller/nodes/workspaceContext.ts` is still a stub.
- The new orchestration design should correct that drift rather than layering another ad hoc path on top.
- V1 should optimize for correctness, visibility, and bounded tool access before introducing worker parallelism.
- There is a second drift risk: upstream Taylor MCP tool names and capability tiers no longer line up cleanly with some local processor assumptions, so planner-worker refactor should include a tool-contract normalization layer instead of relying on legacy hard-coded names.
- The execution ledger should stay lean in v1: one row, one markdown document, optimistic locking, sequential workers. That matches the intended handoff model without prematurely normalizing every step into separate tables.
- Existing organizations will likely need re-consent after scope expansion; rollout should account for mixed old/new integrations during migration.
- `apps/agent/src/services/google.ts` still handles ingestion outside MCP, so planner-worker refactors must avoid regressing that background path.
- Parallel worker execution, cross-provider workers, and fully normalized per-step relational analytics are future enhancements, not v1 requirements.
