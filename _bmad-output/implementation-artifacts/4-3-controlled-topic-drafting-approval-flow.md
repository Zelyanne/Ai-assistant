# Story 4.3: Controlled Topic Drafting & Approval Flow

Status: review

Story ID: 4.3
Story Key: 4-3-controlled-topic-drafting-approval-flow

Dependencies:
- Builds on Story 4.2 `thread.action` execution + `tasks.status='escalation'` UI contract.
- Uses existing Dashboard OutcomeCards + Peek Drawer as the primary approval surface.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an SME Leader,
I want the AI to draft responses for sensitive but routine topics,
so that I only have to review and approve instead of writing from scratch (FR8).

## Acceptance Criteria

1. **Controlled `thread.action` produces an approval-ready draft (no external action):**
   **Given** an ingested Gmail thread is classified to a topic that is authorized as `Controlled` for the org via `agency_perimeters`
   **When** the user triggers automation for that thread (Dashboard bulk automate inserts a `thread.action` task with `tasks.topic` set)
   **Then** the agent MUST NOT call any external side-effect tool (no email send, no calendar create, no Gmail draft creation)
   **And** the agent MUST generate a proposed response draft (subject/body + threading hints) using the existing `Executive Calm` tone
   **And** the task MUST end with `tasks.status = 'escalation'`
   **And** `tasks.result` MUST include an actionable approval payload:
   - `escalation: true`
   - `reason`: why approval is required (e.g., "Controlled topic requires human approval")
   - `prompt`: short instruction for the user ("Review, edit if needed, then Approve")
   - `draft`: `{ to, cc?, bcc?, subject, body, body_format, thread_external_id?, thread_id?, in_reply_to?, references? }`
   - `citations`: include the Gmail thread link built from `ingested_threads.external_id` (or equivalent) when available

2. **Approval UI renders and edits the draft in the Dashboard Peek drawer:**
   **Given** a `tasks.status = 'escalation'` item appears on `apps/web/src/views/Dashboard.vue`
   **When** the user opens the Peek drawer for that escalation
   **Then** the UI displays the draft fields (To, CC, BCC, Subject, Body) with editable inputs
   **And** the UI shows the escalation `prompt` and a link to the original Gmail thread when available
   **And** edits are local-only until the user approves.

   **And** the `Approve` button is only visible/enabled for the Google Workspace integration owner (the `workspace_integrations.user_id` row for `provider='google'` in the same org).

   **And** non-owners see the draft in read-only mode with a short message (e.g., "Only the Gmail account owner can approve/send").

3. **Approve queues a high-risk send task (Gmail owner only):**
   **Given** the current user is the Google Workspace integration owner for the org
   **When** the user clicks `Approve & Send` in the Peek drawer
   **Then** the UI inserts a new row into `public.tasks` with:
   - `domain_action = 'email.send'`
   - `status = 'queued'`
   - `topic` preserved from the source escalation
   - `payload` includes the edited draft fields + `approved_by` (current user id) + `approved_at` (ISO string) + `source_task_id`
   **And** the UI shows a success toast and does not double-submit.

4. **Agent enforces approval + approver identity for send-capable actions:**
   **Given** the agent receives an `email.send` task
   **When** `payload.approved_by` or `payload.approved_at` is missing
   **Then** the agent MUST NOT send
   **And** the task ends with `tasks.status = 'escalation'` and an explicit prompt requesting approval.

   **And** when `payload.approved_by` does not match the Google Workspace integration owner (`workspace_integrations.user_id` for `provider='google'`) for the org
   **Then** the agent MUST NOT send
   **And** the task ends with `tasks.status='escalation'` explaining that only the Gmail owner can approve.

5. **Agent sends via MCP when possible, otherwise degrades safely:**
   **Given** an `email.send` task with approval metadata
   **When** the MCP server exposes a send tool
   **Then** the agent sends via MCP (preferred: `send_gmail_message`)
   **Else** the agent degrades to creating a Gmail draft (existing `create_gmail_draft`) and sets `tasks.status='done'` with `result.summary` indicating manual send is still required.

6. **Auditability + PII safety:**
   - Every approval, draft creation, and send attempt MUST be traceable via `agent_activity_log`.
   - Reasoning traces MUST be PII-redacted; outbound tool calls MUST use real email addresses.
   - The UI must not surface raw thread bodies; it should rely on existing `ThreadSummary` + citations.

7. **Tier guardrails remain intact:**
   - `Restricted` topics still escalate immediately without generating or executing a response draft.
   - `Public` topics retain the autonomous behavior defined in Story 4.2.

## Tasks / Subtasks

- [x] Agent: allow `thread.action` to run for `Controlled` topics (still block `Restricted`).
- [x] Agent: allow `email.send` to run for `Controlled` topics once approved (update requiredTier mapping; enforce approval metadata separately).
- [x] Agent: fix perimeter redaction so execution payloads are not permanently redacted (redact for logs/telemetry only).
- [x] Agent: add `Controlled` branch in `processThreadAction` that generates `result.draft` + escalates without calling MCP.
- [x] Agent: implement `email.send` processor that calls MCP `send_gmail_message` and enforces approval metadata + approver identity.
- [x] Agent: register `email.send` in `apps/agent/src/processors/ProcessorRegistry.ts`.
- [x] Web: extend Dashboard Peek drawer to render/edit `task.result.draft` and show `Approve & Send` only for Gmail owner.
- [x] Web: on approve, insert `email.send` task with `approved_by/approved_at/source_task_id`.
- [x] Tests: add/extend Vitest coverage for gating + payload insertion + escalation rendering.

Suggested subtasks (implementation detail):
- [x] Web: fetch integration owner in Dashboard on mount (`workspace_integrations` where `provider='google'`), cache in state.
- [x] Web: show a PrimeVue ConfirmDialog before inserting `email.send` (send is high-risk).
- [x] Agent: include `message_id` from MCP send tool in `tasks.result` + add citation link if a Gmail web link can be constructed.

## Dev Notes

- **Current perimeter behavior blocks Controlled before `thread.action`:** `apps/agent/src/controller/graph.ts` sets requiredTier=`Public` for most execution tasks, so `Controlled` topics will be escalated in `checkPerimeter` unless we special-case `thread.action`.

- **Approved send still needs to pass perimeter:** `email.send` for a `Controlled` topic will also be escalated unless requiredTier is raised to `Controlled` (or provided via `payload.protocol_overridden_tier='Controlled'`).

- **Important: payload redaction vs real execution:** `checkPerimeter` currently overwrites `task.payload` with redacted JSON. That is OK for prompts/logging but breaks real tool calls for outbound actions (email addresses, names). For send/draft flows, do not mutate the execution payload; only redact what is written to traces/logs.

  Recommended fix pattern:
  - Keep `task.payload` untouched for execution.
  - Create redacted snapshots strictly for:
    - `agent_activity_log.reasoning_trace`
    - any console logs
    - any UI-facing summaries.

- **MCP tool names (upstream google_workspace_mcp):**
  - Draft: `draft_gmail_message` (Extended)
  - Send: `send_gmail_message` (Core)
  Repo currently calls `create_gmail_draft` in `apps/agent/src/processors/EmailDraftProcessor.ts`; upstream does not show that name, so we may need to update or verify backwards compatibility.

  Verified via octocode:
  - `send_gmail_message` returns a string like `Email sent! Message ID: <id>` (or `Email sent with N attachment(s)! ...`).

- **Approval identity source of truth:** use `public.workspace_integrations` row (`provider='google'`) to determine the Gmail owner (`user_id`).

  Web query sketch (Supabase JS):
  - `supabase.from('workspace_integrations').select('user_id').eq('organization_id', orgId).eq('provider', 'google').maybeSingle()`
  - If `user_id` is null or no row: treat as "no owner configured" and disable approve.

- **UI components:** PrimeVue `Drawer`, `Dialog`, `ConfirmDialog` (`useConfirm`), `Toast` (`useToast`), `InputText`, `Textarea`.

- **Result contract suggestion (for UI):**
  - `tasks.result.summary`: human one-liner for OutcomeCard
  - `tasks.result.prompt`: what the user should do
  - `tasks.result.draft`: `{ to, cc?, bcc?, subject, body, body_format: 'plain', thread_id?, in_reply_to?, references? }`
  - `tasks.result.citations`: array with the Gmail thread link (already used in `processThreadAction`)

Edge cases to handle:
- Missing recipient: if `to` is empty after planning, escalate with a prompt asking the Gmail owner to fill `To`.
- No integration owner: show read-only view and guidance to connect Google Workspace.
- Owner mismatch at approval time: web blocks before insert; agent re-check blocks for safety.
- Duplicate approval clicks: disable approve while inserting; include idempotency by checking if an `email.send` task already exists for `source_task_id` (optional).

### Project Structure Notes

- Agent routing: `apps/agent/src/controller/graph.ts` node `thread_action`.
- Perimeter lookup: `apps/agent/src/services/agency.ts` uses `agency_perimeters` by `topic_name`.
- Approval UX surface: `apps/web/src/views/Dashboard.vue` Drawer (`isPeekOpen`, `selectedItem`).
- DB tables in use: `public.tasks`, `public.ingested_threads`, `public.workspace_integrations`, `public.agency_perimeters`, `public.agent_activity_log`.

DB quick check (current project `eoaoiazhsmjbsjazffmx`):
- `agency_perimeters` currently only has `General` set to `Public` for one org and `Restricted` for another; most `tasks.topic` values are `General`. To test `Controlled`, set a topic tier to `Controlled` using `apps/web/src/components/SecurityPerimeterSettings.vue`.

### References

- Context7: PrimeVue ConfirmDialog (`useConfirm` + `confirm.require`) and Dialog/Textarea patterns.
- Octocode: `taylorwilsdon/google_workspace_mcp` `gmail/gmail_tools.py` (`send_gmail_message`, `draft_gmail_message`).
- Repo: `apps/agent/src/controller/graph.ts` (`processThreadAction`, `checkPerimeter`).
- Repo: `apps/web/src/views/Dashboard.vue` (bulk automate + Peek drawer).

PrimeVue snippets (Context7):
- ConfirmDialog (Composition API): `confirm.require({ header, message, accept, rejectProps, acceptProps })`
- Dialog + Textarea/InputText binding patterns for editable content.

LangGraph routing reference (Context7): `StateGraph.addConditionalEdges` patterns.

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- `npx pnpm --filter @ai-assistant/agent test -- src/controller/graph.spec.ts`
- `npx pnpm --filter @ai-assistant/web test -- src/views/Dashboard.spec.ts`
- `npx pnpm -r test`

### Completion Notes List

- Implemented `email.send` processor with approval enforcement (`approved_by/approved_at`), integration-owner identity check, MCP send path, and safe draft fallback.
- Updated graph perimeter/execution flow so payload redaction is telemetry-only and execution payload remains intact; `thread.action` now emits approval-ready escalation drafts for `Controlled` topics.
- Added Dashboard approval UX in Peek drawer: editable draft fields, escalation prompt/thread link, owner-only `Approve & Send` action with confirmation, and task insertion with approval metadata.
- Added/updated tests for controlled escalation draft behavior, email send processor approval gating/fallback, and dashboard approved-send task queueing.
- Ran full monorepo regression suite successfully (`npx pnpm -r test`).

### File List

- `apps/agent/src/controller/graph.ts`
- `apps/agent/src/controller/graph.spec.ts`
- `apps/agent/src/processors/EmailSendProcessor.ts`
- `apps/agent/src/processors/EmailSendProcessor.spec.ts`
- `apps/agent/src/processors/ProcessorRegistry.ts`
- `apps/web/src/views/Dashboard.vue`
- `apps/web/src/views/Dashboard.spec.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/4-3-controlled-topic-drafting-approval-flow.md`
