# Story 6.1: Conversational Command Center & Execution Chat

Status: done

Story ID: 6.1
Story Key: 6-1-natural-language-command-center

Dependencies:
- Story 2.9 provides the normalized multi-channel ingress/egress and delivery lifecycle foundation (`channelRouter`, adapters, webhook routes).
- Story 5.1 and 5.2 provide setup gating and inbound relancing update semantics that must remain compatible with command-center-triggered updates.
- Existing agent safety controls in graph routing remain authoritative (Emergency Brake, perimeter checks, confidence/escalation).

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an SME Leader,
I want a persistent, multi-turn conversational command center in the Hub,
so that I can delegate and execute authorized operational tasks (email, calendar, routing actions) from one chat surface with transparent progress and safe escalation.

## Acceptance Criteria

1. **Conversational Command Center becomes a primary interaction surface:**
   **Given** an authenticated user in the Hub
   **When** they open the command center
   **Then** they can see a persistent conversation timeline (user messages + assistant messages + execution states)
   **And** the experience is optimized for desktop and mobile layouts.

2. **Natural language commands are persisted and queued through database-as-queue:**
   **Given** a user submits a command
   **When** submission succeeds
   **Then** the command is persisted as a conversation message
   **And** a `tasks` row is created with an explicit `domain_action` for command execution
   **And** no direct side-effect execution happens from the UI.

3. **Progressive preview is shown before and during execution:**
   **Given** a command is submitted
   **When** the system analyzes or executes it
   **Then** the UI displays progressive states (e.g., structured intent preview, queued, processing, done/error/escalation/paused)
   **And** updates stream in real time without page refresh.

4. **Multi-turn context is retained for follow-up commands:**
   **Given** a user sends a follow-up message in the same thread
   **When** the assistant evaluates the request
   **Then** prior conversation context is available to the execution path
   **And** each turn remains traceable to the originating task(s).

5. **Safety controls and trust constraints remain non-bypassable:**
   **Given** Emergency Brake is enabled, confidence is low, ambiguity exists, or perimeter rules require review
   **When** command execution is attempted
   **Then** task outcomes follow existing `paused` / `escalation` contracts
   **And** no unauthorized side effects are performed.

6. **Execution outcomes are channel-aware and audit-linked:**
   **Given** a command triggers outbound communication or provider execution
   **When** delivery transitions occur
   **Then** channel metadata and correlation IDs are persisted
   **And** `agent_activity_log` includes reasoning + citations tied to task/message context.

7. **High-risk actions use explicit confirmation UX:**
   **Given** a command resolves to high-risk actions (e.g., send email)
   **When** the user confirms execution
   **Then** confirmation is required before enqueueing side effects
   **And** low-risk actions can proceed without extra friction.

8. **Accessibility and input ergonomics are built-in:**
   **Given** command input is keyboard-driven
   **When** the user presses Enter
   **Then** Enter submits and Shift+Enter inserts a newline
   **And** text area labeling/focus states remain accessible.

## Tasks / Subtasks

- [x] Build command-center UI surface and route (AC: 1, 3, 8)
  - [x] Add a dedicated conversational view under authenticated layout (recommended: `/dashboard/command-center`) and add sidebar navigation entry.
  - [x] Create reusable chat timeline and command composer components using PrimeVue/Tailwind patterns already present in dashboard code.
  - [x] Implement Enter-to-submit / Shift+Enter-newline behavior and accessible input labeling.

- [x] Implement command submission + queue integration (AC: 2, 3, 7)
  - [x] Add command-submit composable/service that persists user message and enqueues command task.
  - [x] Reuse existing Supabase client pattern (`useAgent.submitTask`) and keep write path RLS-safe by `organization_id`.
  - [x] Integrate high-risk confirmation flow using PrimeVue `ConfirmDialog` for guarded actions.

- [x] Add conversation persistence model (AC: 1, 4, 6)
  - [x] Add migration(s) for command conversations/messages (or equivalent normalized schema) with org-scoped RLS and indexes for timeline retrieval.
  - [x] Persist linkage fields for `task_id`, `channel`, `correlation_id`, and message role (`user|assistant|system`).
  - [x] Update shared types/contracts in `packages/shared`.

- [x] Add agent command execution path (AC: 2, 4, 5, 6)
  - [x] Introduce a command-oriented `domain_action` (recommended: `assistant.command`) and wire registry + graph routing + processor.
  - [x] In processor, translate conversational intent into existing execution pathways (`thread.action`, `email.draft`, `email.send`, `calendar.create`, `channel.send`) instead of duplicating logic.
  - [x] Ensure reasoning trace + citations include command and conversation linkage metadata.

- [x] Implement realtime timeline synchronization (AC: 3, 4, 6)
  - [x] Subscribe to relevant tables/channels for task and conversation updates.
  - [x] Reflect status changes and assistant outputs live in timeline.
  - [x] Ensure channel cleanup on unmount to avoid leaks.

- [x] Add comprehensive tests and regressions (AC: 1-8)
  - [x] Web tests for composer behavior, optimistic/progressive states, and confirmation flow.
  - [x] Agent tests for command parsing/routing, escalation paths, and safety precedence.
  - [x] Integration tests for end-to-end path: command submit -> queued task -> graph execution -> timeline update.

## Dev Notes

- Change control on 2026-03-05 explicitly expands Story 6.1 from simple command input to first-class conversational execution; implementation must follow this approved scope and not regress to single-shot command behavior. [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-03-05.md]
- Current dashboard already includes partial command-era primitives (bulk automate, drawer peek, confirmation/toast patterns). Reuse these interaction patterns instead of re-implementing UI mechanics. [Source: apps/web/src/views/Dashboard.vue]
- Existing queue and orchestration are already productionized: `tasks` insert, agent realtime subscriber, graph routing, safety checks, and finalize/audit flow. Build on this pipeline, do not introduce a parallel execution stack. [Source: apps/agent/src/index.ts] [Source: apps/agent/src/controller/graph.ts]
- Channel foundation is in place through Story 2.9 (`channelRouter`, adapter registry, delivery persistence, correlation IDs). Command-center execution should integrate this foundation for outbound or cross-channel effects. [Source: apps/agent/src/services/channelRouter.ts] [Source: _bmad-output/implementation-artifacts/2-9-multi-channel-messaging-adapter-routing-delivery-state.md]

### Technical Requirements

- Use database-as-queue contract for all execution intents (`tasks.status='queued'` then graph processing); the web layer must never call provider APIs directly.
- Preserve task status contract exactly: `queued`, `processing`, `done`, `error`, `escalation`, `paused`.
- If introducing a new command action (recommended `assistant.command`), wire it in both `ProcessorRegistry` and graph nodes/edges.
- Conversation-to-task linkage must include deterministic IDs (`task_id`, `correlation_id`, `thread_id` where applicable) for audit and UI replay.
- High-risk command actions must pass explicit user confirmation before enqueueing.
- Reuse existing escalation payload conventions (`reason`, `prompt`, confidence metadata) for trust-consistent UI handling.

### Architecture Compliance

- Respect event-driven boundary: UI writes intent; agent executes asynchronously; UI listens for updates.
- Keep security/perimeter checks centralized in graph execution path; command processor must not bypass `checkPerimeter` or confidence gates.
- Maintain append-only audit semantics in `agent_activity_log`.
- Keep shared contracts centralized in `packages/shared`; do not duplicate payload schemas in app-specific code.
- Apply schema changes via migrations only; include RLS and realtime publication decisions intentionally.

### Library & Framework Requirements

- Current repository stack to target:
  - `vue` `^3.5.0`, `primevue` `^4.0.0`, `@supabase/supabase-js` `^2.43.0` (web)
  - `@langchain/langgraph` `^0.2.0`, `@supabase/supabase-js` `^2.43.0` (agent)
- Latest ecosystem intelligence (reference only, no automatic upgrade in this story):
  - `vue` `3.5.29`, `primevue` `4.5.4`, `@supabase/supabase-js` `2.98.0`, `@langchain/langgraph` `1.2.1`.
- Context7 documentation confirms best-practice patterns required by this story:
  - Vue `<script setup>` + watcher cleanup discipline
  - PrimeVue Textarea/Dialog/ConfirmDialog accessibility and UX patterns
  - Supabase insert + realtime subscription + channel cleanup lifecycle.
- Octocode recent successful examples used for implementation guardrails:
  - `primefaces/primevue-examples` bootstrapping and theme setup (`vite-ts-quickstart/src/main.ts`, last modified 2025-02-26)
  - `primefaces/primevue` Drawer and ConfirmDialog showcase docs (`apps/showcase/doc/...`, updated 2025-07-09+)
  - `supabase/supabase` slack-clone message insert + realtime subscription pattern (`examples/slack-clone/nextjs-slack-clone/lib/Store.js`, last modified 2025-08-18).

### File Structure Requirements

- Web (new/updated):
  - `apps/web/src/views/CommandCenter.vue` (new primary chat surface)
  - `apps/web/src/components/command/CommandTimeline.vue`
  - `apps/web/src/components/command/CommandComposer.vue`
  - `apps/web/src/composables/useCommandCenter.ts`
  - `apps/web/src/router/index.ts` (route)
  - `apps/web/src/components/layout/AppSidebar.vue` (nav entry)
- Agent (new/updated):
  - `apps/agent/src/processors/AssistantCommandProcessor.ts` (or equivalent)
  - `apps/agent/src/processors/ProcessorRegistry.ts`
  - `apps/agent/src/controller/graph.ts`
- Shared contracts:
  - `packages/shared/src/schemas.ts`
  - `packages/shared/src/database.types.ts`
- Database migrations:
  - `supabase/migrations/<timestamp>_create_command_center_conversations.sql`

### Testing Requirements

- Web unit/component tests (Vitest):
  - composer keyboard behavior (Enter vs Shift+Enter)
  - confirmation flow for high-risk actions
  - realtime timeline updates and subscription cleanup.
- Agent tests:
  - command parser/routing and downstream action mapping
  - escalation and emergency-brake precedence
  - correlation/audit payload completeness.
- Integration tests:
  - command submit -> task queued -> graph processed -> timeline reflects terminal state.
- Verification commands:
  - `pnpm -r test`
  - `pnpm -r build`
  - `pnpm -r lint`

### Previous Story Intelligence

- Story 2.9 already solved multi-channel normalization, dedupe, delivery transitions, and correlation metadata; reuse these foundations.
- Story 5.1/5.2 established relancing setup gating and update semantics that command center should trigger or consume without bypassing required setup checks.
- Current dashboard already has high-risk confirmation, progressive status, drawer peek, and realtime table subscriptions; command center should extend, not replace, these patterns.

### Git Intelligence Summary

- Recent implementation trend is graph-centric safety and queue-driven orchestration with strong tests; continue this pattern.
- The codebase already routes many domain actions via registry + graph; introducing command handling should align with this architecture for consistency and low risk.

### Latest Technical Information

- Context7 (Vue docs): use `<script setup>`, explicit watcher lifecycle management, and cleanup patterns for reactive async operations.
- Context7 (PrimeVue docs): `Textarea` supports `autoResize`; `Dialog/Drawer` visibility uses `v-model:visible`; `ConfirmDialog` + `useConfirm` is canonical for guarded actions.
- Context7 (Supabase docs): canonical DB `.insert()` and realtime `.channel(...).on(...).subscribe(...)` with explicit cleanup (`unsubscribe` + `removeChannel`).
- Octocode confirms active, recent example repos and practical snippets used in this story context:
  - `primefaces/primevue-examples`
  - `primefaces/primevue`
  - `supabase/supabase`.

### Project Context Reference

- Enforce project rules in `_bmad-output/project-context.md`: strict typing, no `any`, shared schema usage, RLS-safe access, and cleanup of realtime subscriptions.
- Keep naming rules: DB `snake_case`, TypeScript `camelCase`/`PascalCase`.
- Keep dependency discipline: prefer existing stack and internal helpers before adding new packages.

### Project Structure Notes

- This story aligns with current monorepo boundaries (`apps/web`, `apps/agent`, `packages/shared`, `supabase/migrations`).
- Architecture artifact legacy references should be interpreted against current source-of-truth files (`graph.ts`, `ProcessorRegistry.ts`, `channelRouter.ts`).
- Story key remains `6-1-natural-language-command-center` for tracking continuity, while approved scope/title is conversational execution chat.

### References

- [Source: _bmad-output/planning-artifacts/epics.md]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-03-05.md]
- [Source: _bmad-output/planning-artifacts/architecture.md]
- [Source: _bmad-output/project-context.md]
- [Source: _bmad-output/implementation-artifacts/2-9-multi-channel-messaging-adapter-routing-delivery-state.md]
- [Source: _bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md]
- [Source: _bmad-output/implementation-artifacts/5-2-bidirectional-nudge-interface.md]
- [Source: apps/web/src/views/Dashboard.vue]
- [Source: apps/web/src/composables/useAgent.ts]
- [Source: apps/web/src/router/index.ts]
- [Source: apps/web/src/components/layout/AppSidebar.vue]
- [Source: apps/web/src/components/activity/OutcomeCard.vue]
- [Source: apps/agent/src/index.ts]
- [Source: apps/agent/src/controller/graph.ts]
- [Source: apps/agent/src/processors/ProcessorRegistry.ts]
- [Source: apps/agent/src/services/channelRouter.ts]
- [Source: apps/agent/src/processors/ChannelSendProcessor.ts]
- [Source: apps/agent/src/processors/RelancingUpdateProcessor.ts]
- [Source: packages/shared/src/schemas.ts]
- [Source: supabase/migrations/20260114000000_core_and_domain_schema.sql]
- [External Source: Context7 `/vuejs/docs`]
- [External Source: Context7 `/websites/primevue`]
- [External Source: Context7 `/supabase/supabase-js`]
- [External Source: Octocode `primefaces/primevue-examples`]
- [External Source: Octocode `primefaces/primevue`]
- [External Source: Octocode `supabase/supabase`]

### Completion Status

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story is ready for development handoff.

## Dev Agent Record

### 2026-03-09 Status Update (Amelia / openai-gpt-5.2)

- Marked story back to `in-progress` due to repository hygiene blockers (generated `apps/web/src/**/*.vue.js` + `*.map` containing `debugger;`).
- Full repo gates (`pnpm -r test`, `pnpm -r lint`, `pnpm -r build`) not re-verified in this session; do not treat prior log lines as authoritative without rerunning.
- Next verification target: remove/stop tracking generated artifacts, rerun gates, then move back to `review`.

### Agent Model Used

openai/gpt-5.3-codex

### Implementation Plan

- Add `assistant.command` delegation processor and route it through graph so delegated actions reuse existing processors and safety controls.
- Add realtime task/message subscriptions in command center composable and wire lifecycle cleanup at view mount/unmount.
- Expand web + agent regression tests to cover command ambiguity/escalation, emergency brake precedence, and end-to-end timeline progression.

### Debug Log References

- Context7 lookups: Vue docs, PrimeVue docs, Supabase JS docs.
- Octocode lookups: recent repo discovery and snippet extraction from PrimeVue and Supabase repositories.
- Local architecture/code analysis: dashboard UI, router, sidebar, queue pipeline, graph routing, channel router, relancing processor, shared schemas.
- Validation framework note: `_bmad/core/tasks/validate-workflow.xml` was not found in this workspace, so checklist invocation could not run through the expected automation path.
- Context7 docs query executed for PrimeVue Textarea patterns (v-model, autoResize, accessibility label wiring).
- Context7 docs query executed for PrimeVue ConfirmDialog + `useConfirm` composition pattern and accept callback flow.
- Supabase docs search executed (Supabase MCP) for realtime/RLS references relevant to publication + org-scoped policies.
- Octocode GitHub search executed against `primefaces/primevue` to confirm official Textarea usage examples.
- Validation commands run: `pnpm -C apps/web test`, `pnpm -C apps/web lint`, `pnpm -C apps/web build`, `pnpm -r test`, `pnpm -r lint`, `pnpm -r build`.
- Task 4 validation commands run: `pnpm -C apps/agent test -- src/processors/AssistantCommandProcessor.spec.ts src/controller/graph.spec.ts`, `pnpm -C apps/web test -- src/composables/useCommandCenter.spec.ts src/views/CommandCenter.spec.ts`, `pnpm -r test`, `pnpm -r lint`, `pnpm -r build`.
- Task 5 validation commands run: `pnpm -C apps/web test -- src/composables/useCommandCenter.spec.ts src/views/CommandCenter.spec.ts`, `pnpm -C apps/agent test -- src/processors/AssistantCommandProcessor.spec.ts src/controller/graph.spec.ts`, `pnpm -r test`, `pnpm -r lint`, `pnpm -r build`.
- Task 6 validation commands run: `pnpm -C apps/web test -- src/composables/useCommandCenter.spec.ts`, `pnpm -C apps/agent test -- src/controller/graph.spec.ts`, `pnpm -r test`, `pnpm -r lint`, `pnpm -r build`.

### Completion Notes List

- Story 6.1 was generated from updated approved scope (conversational command center), not legacy single-input interpretation.
- Guardrails include architecture continuity, safety precedence, realtime lifecycle discipline, and concrete recent external examples.
- Story status intentionally set to `ready-for-dev` for implementation handoff.
- Completed Task 1 UI foundation: added `/dashboard/command-center` route, sidebar navigation entry, reusable command timeline/composer components, and keyboard-accessible Enter/Shift+Enter behavior.
- Added/updated tests for route accessibility, sidebar nav presence, command composer submit ergonomics, and command-center progressive state rendering.
- Completed Task 2 queue integration: added `useCommandCenter` composable, queued `assistant.command` submission via `useAgent.submitTask`, and high-risk confirm-before-queue flow with PrimeVue `ConfirmDialog`.
- Added tests for command-center submission semantics (low-risk queue, high-risk confirmation gate, force-confirm queue path, and enqueue failure state).
- Completed Task 3 persistence model: added `command_conversations` + `command_messages` migration with org RLS, timeline indexes, realtime publication, and linkage fields (`source_task_id`, `channel`, `correlation_id`, `thread_id`, `role`).
- Updated shared contracts (`schemas.ts`, `database.types.ts`) and added migration/schema tests for command-center persistence and payload validation.
- Completed Task 4 command execution path: added `AssistantCommandProcessor`, registered `assistant.command` in `ProcessorRegistry`, and wired graph routing to delegate command intents into existing execution pathways.
- Added command-centric guardrails and traceability: explicit high-risk confirmation escalation in agent path plus command/conversation linkage citations in processor output.
- Completed Task 5 realtime timeline synchronization: added task + command message subscriptions in `useCommandCenter`, mapped task status updates to timeline states, and wired start/stop realtime lifecycle from `CommandCenter.vue` mount/unmount.
- Added persistence glue for command conversations/messages (`command_conversations`, `command_messages`) so optimistic timeline entries can be synchronized and kept traceable with `correlation_id`.
- Completed Task 6 regression coverage: expanded web progression tests (submit -> queued -> processing -> done), added assistant-command ambiguity + emergency-brake graph tests, and re-ran full repo test/lint/build gates with all checks green (lint warnings only).

### File List

- `_bmad-output/implementation-artifacts/6-1-natural-language-command-center.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/web/src/router/index.ts`
- `apps/web/src/router/index.spec.ts`
- `apps/web/src/components/layout/AppSidebar.vue`
- `apps/web/src/components/layout/AppSidebar.spec.ts`
- `apps/web/src/components/command/types.ts`
- `apps/web/src/components/command/CommandTimeline.vue`
- `apps/web/src/components/command/CommandComposer.vue`
- `apps/web/src/components/command/CommandComposer.spec.ts`
- `apps/web/src/views/CommandCenter.vue`
- `apps/web/src/views/CommandCenter.spec.ts`
- `apps/web/src/views/CommandCenter.spec.js`
- `apps/web/src/composables/useCommandCenter.ts`
- `apps/web/src/composables/useCommandCenter.js`
- `apps/web/src/composables/useCommandCenter.spec.ts`
- `apps/web/src/composables/useCommandCenter.spec.js`
- `supabase/migrations/20260309100000_create_command_center_conversations.sql`
- `packages/shared/src/schemas.ts`
- `packages/shared/src/database.types.ts`
- `packages/shared/tests/schemas.spec.ts`
- `packages/shared/tests/command-center-migration.spec.ts`
- `apps/agent/src/processors/AssistantCommandProcessor.ts`
- `apps/agent/src/processors/AssistantCommandProcessor.spec.ts`
- `apps/agent/src/processors/ProcessorRegistry.ts`
- `apps/agent/src/controller/graph.ts`
- `apps/agent/src/controller/graph.spec.ts`

### Change Log

- 2026-03-09: Completed Story 6.1 implementation (Tasks 1-6), set story status to `review`, and synced sprint status to `review`.
