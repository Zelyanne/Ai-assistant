# Story 4.2: Autonomous Proxy Execution (Routine Questions + Routine Tasks)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Team Member,
I want the assistant to answer routine questions and complete simple routine requests on behalf of the CEO,
so that I get the information (or outcome) I need instantly (FR7).

## Acceptance Criteria

1. **Automate Routine Public-Topic Replies + Tasks (Gmail):**
   **Given** an incoming Gmail thread is triaged/summarized and the CEO triggers automation for that thread (Dashboard bulk automate)
   **And** the thread's topic is authorized as `Public` for the org via `agency_perimeters`
    **When** the agent processes a `thread.action` task for that thread
    **And** the agent produces a response with `confidence >= CONFIDENCE_THRESHOLD` and `ambiguity_detected === false`
   **Then** the agent performs the routine action appropriate to the request, such as:
   - sending an informational reply via Gmail (same thread), OR
   - creating a calendar event (`calendar.create`) when the email asks to schedule something, OR
   - drafting an email reply (`email.draft`) when sending is not available or not permitted
   **And** the task ends with `tasks.status = 'done'` and `tasks.result.summary` describing the action taken.

2. **No Autonomous Action Outside Public Tier:**
   **Given** a `thread.action` task for a topic authorized as `Controlled` or `Restricted`
    **When** the agent evaluates the request
   **Then** the agent MUST NOT perform any external action (no replies sent, no calendar events created)
    **And** the task ends with `tasks.status = 'escalation'`
    **And** `tasks.result` includes `{ escalation: true, reason, prompt }` suitable for rendering an Escalation card.

3. **Low Confidence or Ambiguity Escalates:**
   **Given** a `thread.action` task for a `Public` topic
   **When** the response confidence is below `CONFIDENCE_THRESHOLD` OR ambiguity is detected
   **Then** the agent MUST NOT perform any external action
   **And** the task ends with `tasks.status = 'escalation'` with an actionable escalation payload.

4. **Perimeter Enforcement and Protocol Overrides Are Honored:**
   - Agency tier authorization MUST be enforced via `AgencyService.getTierForTopic()` and `PerimeterGuard` logic.
   - Protocol-extracted overrides (e.g., "Required Agency Tier: Controlled") MUST be respected (see `apps/agent/src/controller/nodes/protocol.ts`).

5. **Auditability + Reasoning Trace + Citations:**
   - Every automated reply or routine task MUST be traceable via `agent_activity_log` for the task.
   - Include citations linking to the Gmail thread (use `ingested_threads.external_id` to build `https://mail.google.com/mail/u/0/#all/<external_id>`).
   - Reasoning trace MUST record: perimeter decision, confidence value, decision to send vs escalate, and the tool/API action taken.

6. **Escalation Status Must Persist (UI Contract):**
   Escalations MUST persist as `tasks.status = 'escalation'` (not `error`) so the Dashboard can:
   - count escalations (`apps/web/src/views/Dashboard.vue`)
   - render OutcomeCards with `status = 'escalation'`.

7. **PII Safety Boundaries:**
   - Redact PII before LLM calls where feasible (use `PerimeterGuard` like `ThreadSummarizer` does).
   - Do NOT leak PII into `agent_activity_log.reasoning_trace` or console logs.
   - Outbound email sending is allowed to use original recipient addresses (Gmail API), but logging must use redacted text.

## Tasks / Subtasks

- [x] **Web: pass topic into automation tasks** (AC: 1, 2, 4)
  - [x] Update `apps/web/src/views/Dashboard.vue` bulk automation insert to set `topic` for `thread.action` tasks from the thread's classification topics (first match), falling back to `General`.
  - [x] Treat `thread.action` as a high-risk action alongside `email.send` for the confirmation dialog.

- [x] **Agent: implement `thread.action` autonomous proxy execution** (AC: 1-5, 7)
  - [x] Add a dedicated node/handler for `thread.action` in `apps/agent/src/controller/graph.ts` (do not route to `unsupported_domain`).
  - [x] Load the source thread from `public.ingested_threads` using `payload.thread_id` (or `payload.source_id` when `source_type === 'thread'`).
  - [x] Build an LLM prompt that:
    - uses the thread subject + `summary_json` (context/decisions/action_items)
    - applies "Executive Calm" tone
    - classifies intent into an explicit action plan (reply-only vs calendar.create vs email.draft vs escalate)
    - produces explicit `confidence` + `ambiguity_detected` flags.
  - [x] Use a structured schema for the decision (recommended: add a `ThreadActionDecisionSchema` to `packages/shared/src/schemas.ts` and reuse it in the agent).
  - [x] If confident + Public tier: execute the planned routine action(s) and set `result.summary` as a "Silent Win".
  - [x] Otherwise: set `task.status = 'escalation'` and write an escalation payload to `task.result`.

- [x] **Agent: fulfill the routine action plan** (AC: 1, 5, 7)
  - [x] Calendar tasks: create events via existing `calendar.create` processor (preferred) or direct MCP tool call.
  - [x] Email tasks:
    - If the MCP server exposes a safe "send" tool, implement in-thread replies.
    - If only drafting is available, create a Gmail draft (`create_gmail_draft`) and mark the outcome as completed-with-draft (still `done`), OR escalate if protocol/required tier demands approval.
  - [x] Keep tool usage consistent with current stack: prefer existing MCP + token patterns already used in ingestion and processors.

- [x] **Agent: fix escalation persistence** (AC: 6)
  - [x] Update `apps/agent/src/controller/nodes/escalate.ts` to set `tasks.status = 'escalation'` (and not `error`).
  - [x] Ensure `apps/agent/src/controller/graph.ts` finalize logic preserves `escalation` status and result payload.

- [x] **Tests** (AC: 1-7)
  - [x] Add agent tests for `thread.action` covering: Public+high-confidence send, Public+low-confidence escalation, Controlled/Restricted escalation.
  - [x] Add a web unit test for bulk automation ensuring the inserted task includes `topic` for thread items.

## Dev Notes

- Reuse existing patterns; do not introduce new orchestration frameworks.
  - Graph orchestration: `apps/agent/src/controller/graph.ts`
  - Protocol extraction + tier override: `apps/agent/src/controller/nodes/protocol.ts`
  - Tier lookup: `apps/agent/src/services/agency.ts`
  - PII redaction: `apps/agent/src/guards/PerimeterGuard.ts`
  - Audit flush: `apps/agent/src/services/AuditLogger.ts`

- Avoid a common failure mode: do not redact outbound tool/API arguments in a way that breaks delivery.
  Use redaction for LLM inputs and logs, but preserve real email addresses for Gmail send.

- Source-of-truth for UI behavior:
  - Outcome cards render "Silent Win" when `tasks.status === 'done'`.
  - Escalations must be `tasks.status === 'escalation'` to render/aggregate correctly.

### Project Structure Notes

- Agent entry point + graph:
  - `apps/agent/src/index.ts`
  - `apps/agent/src/controller/graph.ts`
- Thread data source:
  - `public.ingested_threads` (see `packages/shared/src/database.types.ts`)
- Dashboard automation trigger:
  - `apps/web/src/views/Dashboard.vue`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-4.2-Autonomous-Proxy-Execution]
- [Source: _bmad-output/planning-artifacts/prd.md#2-Autonomous-Proxy-Agency]
- [Source: _bmad-output/planning-artifacts/architecture.md#API-&-Communication-Patterns]
- [Source: _bmad-output/project-context.md#Critical-Implementation-Rules]
- [Source: apps/agent/src/controller/graph.ts]
- [Source: apps/agent/src/controller/nodes/reasoning.ts]
- [Source: apps/agent/src/controller/nodes/escalate.ts]
- [Source: apps/agent/src/guards/PerimeterGuard.ts]
- [Source: apps/agent/src/services/agency.ts]
- [Source: apps/agent/src/services/google.ts]
- [Source: apps/web/src/views/Dashboard.vue]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.2

### Debug Log References

- Context7: `/supabase/supabase-js` insert patterns; `/primefaces/primevue` `confirm.require` usage.
- Supabase MCP: verified `public.tasks.topic` exists and inspected recent task rows.

### Completion Notes List

- Implemented Dashboard bulk automation to persist `tasks.topic` for `thread.action` and require confirmation for `thread.action` alongside `email.send`.
- Implemented `thread.action` autonomous proxy execution in `apps/agent/src/controller/graph.ts` with PerimeterGuard redaction, structured decisioning (`ThreadActionDecisionSchema`), and routine execution via `email.draft`/`calendar.create` processors.
- Fixed escalation persistence to use `tasks.status = 'escalation'` in `apps/agent/src/controller/nodes/escalate.ts` and ensured graph finalization preserves `escalation` status.
- Code review fixes: sanitized error propagation/logging in `graph.ts` to avoid PII leakage in escalation/audit paths and removed `any` typing from `graph.spec.ts` test harness.
- Added/expanded `thread.action` coverage for `calendar.create` execution and protocol tier override enforcement path assertions.
- Tests: `npx pnpm -r --if-present test`.

### File List

- apps/web/src/views/Dashboard.vue
- apps/web/src/views/Dashboard.spec.ts
- apps/agent/src/controller/graph.ts
- apps/agent/src/controller/graph.spec.ts
- apps/agent/src/controller/nodes/escalate.ts
- packages/shared/src/schemas.ts
- _bmad-output/implementation-artifacts/sprint-status.yaml

## Senior Developer Review (AI)

- Reviewer: Amelia (Developer Agent)
- Date: 2026-02-18
- Outcome: Approve
- Findings Resolved:
  - [High] Prevented potential PII leakage by avoiding raw error propagation into task/audit paths in `apps/agent/src/controller/graph.ts`.
  - [High] Added missing `thread.action -> calendar.create` success-path test in `apps/agent/src/controller/graph.spec.ts`.
  - [Medium] Added protocol tier override validation test for `thread.action` in `apps/agent/src/controller/graph.spec.ts`.
  - [Medium] Removed TypeScript `any` usage in modified graph code/tests.
- Validation:
  - `npx pnpm --filter @ai-assistant/agent test -- src/controller/graph.spec.ts`
  - `npx pnpm -r --if-present test`

## Change Log

- 2026-02-18: Senior code review completed; fixed high/medium findings for AC coverage, PII-safe error handling, and typing quality. Story advanced to `done`.
