# Story 5.2: Bidirectional Nudge Interface

Status: done

Story ID: 5.2
Story Key: 5-2-bidirectional-nudge-interface

Dependencies:
- Builds on Story 5.1 scheduler/setup gating so inbound replies can be linked to active project/member nudge cycles.
- Reuses channel ingestion + task queue flow (`channelRouter` -> `tasks.status='queued'` -> `graph.invoke`) for bidirectional replies across web/Telegram/WhatsApp.
- Must preserve Story 4.4/4.5 safety behavior (`paused` on emergency brake, `escalation` on ambiguity/restricted-topic conditions).

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Team Member,
I want to report blockers or status directly to the AI from my active nudge channel,
so that the PM receives structured, real-time project updates without another status meeting (FR4, FR5).

## Acceptance Criteria

1. **Bidirectional reply intake is supported on configured channels:**
   **Given** a team member receives a nudge on Web, Telegram, or WhatsApp
   **When** they reply with a free-text update
   **Then** the message is normalized and queued through the existing database-as-queue flow with channel metadata (`channel`, `external_message_id`, `thread_id`, `correlation_id`)
   **And** delivery transitions are persisted for traceability.

2. **Member replies are parsed into structured update intents:**
   **Given** an inbound member reply
   **When** processing runs
   **Then** the system classifies the reply as at least one of `status_update` or `blocker_report`
   **And** extracts actionable fields where present (`progress_summary`, `blocker_summary`, `dependency`, `requested_help`, `eta_hint`).

3. **Project/member linkage is enforced before applying relancing updates:**
   **Given** an inbound update message
   **When** project setup context from Story 5.1 is available and valid (`setup_status=complete`)
   **Then** the update is linked to the correct project/member nudge cycle
   **And** if setup context is missing or invalid, processing escalates with `setup_required` guidance instead of silently applying updates.

4. **Blocker-aware pause behavior updates scheduler state:**
   **Given** a parsed `blocker_report`
   **When** the update is linked to an active nudge cycle
   **Then** the cycle is paused with explicit reason code `blocker_paused`
   **And** follow-up nudges for that member/project are suppressed until blocker resolution rules are satisfied.

5. **PM-facing reporting surfaces are updated from parsed replies:**
   **Given** a parsed status/blocker update
   **When** persistence succeeds
   **Then** the system writes normalized reporting data consumable by Morning Brief and Dashboard
   **And** blocker updates appear in blocker-oriented views/filters without requiring manual PM data entry.

6. **Safety and escalation guardrails remain authoritative:**
   **Given** emergency brake is engaged, confidence is below threshold, ambiguity is detected, or perimeter rules require review
   **When** update handling would trigger side effects
   **Then** task status becomes `paused` or `escalation` according to existing contracts
   **And** no side-effecting execution path is run.

7. **Multi-tenant isolation and auditability are preserved:**
   **Given** any inbound reply/update processing
   **When** reads/writes occur
   **Then** all operations are scoped by `organization_id` under RLS
   **And** append-only audit entries capture decision reasons (`inbound_status_update`, `blocker_detected`, `blocker_paused`, `setup_required`, `ambiguity_escalated`).

8. **Idempotency prevents duplicate update application:**
   **Given** provider retries or duplicate webhook deliveries for the same message
   **When** the system ingests the duplicate payload
   **Then** only one logical relancing update is applied
   **And** duplicates are recorded as non-destructive trace events.

## Tasks / Subtasks

- [x] Implement relancing update persistence and contracts (AC: 2, 5, 7, 8)
  - [x] Add migration(s) for normalized relancing update storage and idempotency keys (`organization_id`, project/member linkage, channel message identity, parsed intent fields).
  - [x] Add/refresh RLS policies and indexes for organization-safe access and dedupe performance.
  - [x] Update shared contracts in `packages/shared/src/database.types.ts` and `packages/shared/src/schemas.ts`.

- [x] Add inbound routing for bidirectional nudge replies (AC: 1, 8)
  - [x] Extend channel ingestion routing so nudge replies can be intentionally processed as relancing updates (without breaking existing `thread.action` flows).
  - [x] Preserve delivery-history persistence and correlation metadata in `tasks.result`.
  - [x] Add duplicate-detection guardrails keyed by channel message identity/correlation.

- [x] Implement relancing update processing path in agent graph/processors (AC: 2, 3, 4, 6, 7)
  - [x] Add processor or dedicated graph node for parsing `status_update` and `blocker_report` intent from inbound text.
  - [x] Integrate Story 5.1 setup gating and project/member linkage before applying update outcomes.
  - [x] Apply blocker pause transitions for active nudge cycles with reason code `blocker_paused`.
  - [x] Reuse confidence/perimeter/emergency-brake safeguards so side effects never bypass existing controls.

- [x] Surface parsed updates in PM reporting views (AC: 5)
  - [x] Update Dashboard mapping/filter logic so blocker reports are visible and traceable.
  - [x] Extend Morning Brief/status aggregation inputs to include normalized relancing updates.

- [x] Add regression and contract tests (AC: 1-8)
  - [x] Agent tests for parsing, setup-required escalation, blocker pause behavior, and idempotency.
  - [x] Webhook/router tests for valid/invalid payloads, dedupe, and delivery-history persistence.
  - [x] Web tests to ensure blocker/status updates appear in expected PM-facing views.

## Dev Notes

- Story 5.2 should implement **reply intake + structured update extraction** only; autonomous cadence computation belongs to Story 5.1 and policy auto-adjustment logic belongs to Story 5.3.
- The existing channel ingestion path already supports normalized inbound envelopes and delivery-state persistence into `tasks.result.channel_delivery*`; extend this path rather than adding a parallel webhook/task system.
- Current inbound adapters default to `domain_action='thread.action'`; this story should introduce explicit routing for bidirectional nudge replies so relancing updates are not conflated with generic thread action handling.
- The agent graph is the authority for task status transitions (`queued -> processing -> done|error|escalation|paused`) and already encodes emergency-brake/perimeter/confidence precedence; reply processing must preserve that ordering.
- PM-facing blocker visibility should reuse existing Dashboard/Morning Brief pipelines and contracts, not create one-off reporting views.

### Developer Context Section

- Existing webhook adapters and routers (`telegram`, `whatsapp`, `web`) already validate, normalize, and enqueue inbound payloads via `ChannelRouterService.enqueueInbound`; Story 5.2 should layer relancing semantics on top of this shared transport.
- `ChannelRouterService` already writes correlation and delivery metadata (`channel_delivery`, `channel_delivery_history`) and has duplicate transition suppression for delivery events; this provides a baseline pattern for idempotent inbound update handling.
- `loadProtocol` currently includes lightweight blocker keyword detection against message context and can pause tasks; Story 5.2 should harden this into explicit, persisted blocker/status update intents tied to project/member setup context from Story 5.1.
- `MorningBriefProcessor` already persists blocker/risk/actionable metadata into `morning_briefs`; relancing updates should feed this reporting path with normalized source records.
- No project/member relancing schema exists yet in current migrations; if Story 5.1 introduces it, Story 5.2 must integrate with that canonical schema instead of adding duplicates.
- Cross-story continuity:
  - Story 5.1 established setup gating, scheduler expectations, and reason-code audit semantics.
  - Story 4.4/4.5 established safety-first behavior (`paused` / `escalation`) that remains non-negotiable for inbound reply handling.

### Technical Requirements

- Preserve the existing inbound queue contract: member replies must continue entering the system through `ChannelRouterService.enqueueInbound` with `tasks.status='queued'` and channel metadata (`channel`, `external_message_id`, `thread_id`, `correlation_id`) persisted in payload/result. [Source: apps/agent/src/services/channelRouter.ts:144]
- Introduce an explicit relancing-reply handling path (recommended `domain_action` such as `relancing.update`) so bidirectional nudge responses are not processed as generic `thread.action` decisions. If a new action is introduced, wire it in both graph routing and processor registry. [Source: apps/agent/src/controller/graph.ts:953] [Source: apps/agent/src/processors/ProcessorRegistry.ts:10]
- Parse inbound free text into structured intent (`status_update` and/or `blocker_report`) and normalized fields (`progress_summary`, `blocker_summary`, `dependency`, `requested_help`, `eta_hint`) using shared schemas, not local ad hoc interfaces. [Source: packages/shared/src/schemas.ts:1] [Source: _bmad-output/project-context.md:36]
- Enforce Story 5.1 setup gating before applying any relancing update: if project/member setup is incomplete or unresolved, escalate with explicit `setup_required` guidance rather than mutating scheduler state. [Source: _bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md:23]
- For blocker intent, apply pause semantics to the linked member/project nudge cycle with reason code `blocker_paused`, and suppress new nudges until resolution criteria are met by policy. [Source: _bmad-output/planning-artifacts/epics.md:276] [Source: _bmad-output/planning-artifacts/prd.md:199]
- Implement idempotent ingestion for provider retries/duplicates using deterministic identity (`organization_id + channel + external_message_id` with correlation fallback) so only one logical update is applied per inbound message. [Source: apps/agent/src/services/channelRouter.ts:70]
- Persist normalized update records for PM reporting pipelines (Dashboard + Morning Brief/status aggregation), avoiding one-off UI-only state that bypasses backend traceability. [Source: apps/web/src/views/Dashboard.vue:909] [Source: apps/agent/src/processors/MorningBriefProcessor.ts:288]
- Keep safety precedence intact: emergency brake and confidence/perimeter escalation must continue to win over side-effect paths (`paused`/`escalation` semantics remain unchanged). [Source: apps/agent/src/controller/graph.ts:111] [Source: apps/agent/src/controller/graph.ts:935]
- Record append-only audit reasons for key decisions (`inbound_status_update`, `blocker_detected`, `blocker_paused`, `setup_required`, `ambiguity_escalated`, `duplicate_prevented`). [Source: _bmad-output/planning-artifacts/prd.md:229] [Source: _bmad-output/project-context.md:34]

### Architecture Compliance

- Maintain the Database-as-Queue architecture boundary: web/channel ingress writes tasks, agent consumes asynchronously via Realtime and persists results/status; do not introduce direct synchronous side-effect execution from webhook handlers. [Source: _bmad-output/planning-artifacts/architecture.md:65] [Source: _bmad-output/planning-artifacts/architecture.md:124]
- Keep task lifecycle semantics aligned with the existing graph contracts (`queued`, `processing`, `done`, `error`, `escalation`, `paused`) so Dashboard counters and OutcomeCard states remain compatible. [Source: apps/agent/src/controller/graph.ts:835] [Source: apps/web/src/views/Dashboard.vue:352]
- Preserve guardrail ordering already encoded in graph flow: emergency brake check first, then perimeter/protocol/reasoning/escalation routing. New relancing-reply logic must plug into this sequence, not bypass it. [Source: apps/agent/src/controller/graph.ts:983] [Source: apps/agent/src/controller/graph.ts:1004]
- Keep shared-contract discipline across monorepo boundaries: DB schema + Zod schema changes must land in `packages/shared` and be consumed by both `apps/agent` and `apps/web`. [Source: _bmad-output/planning-artifacts/architecture.md:297] [Source: _bmad-output/project-context.md:36]
- Apply schema changes only through timestamped Supabase migrations with RLS policy updates; no runtime schema mutation logic in app code. [Source: _bmad-output/planning-artifacts/architecture.md:114] [Source: _bmad-output/planning-artifacts/architecture.md:153]
- Respect multi-tenant isolation at every read/write boundary by `organization_id`; PM-facing reporting from relancing updates must remain organization-scoped under RLS. [Source: _bmad-output/planning-artifacts/architecture.md:120] [Source: _bmad-output/planning-artifacts/prd.md:223]
- Keep `agent_activity_log` append-only and use it for decision observability; do not overwrite historical reasoning entries when handling duplicates/retries. [Source: _bmad-output/planning-artifacts/architecture.md:104]

### Library & Framework Requirements

- Keep implementation within the existing stack already used in this repo: Vue 3 + PrimeVue on web, Node/TypeScript + LangGraph on agent, Supabase for queue/realtime/persistence. Do not introduce a parallel orchestration or messaging framework in Story 5.2. [Source: _bmad-output/planning-artifacts/architecture.md:59] [Source: _bmad-output/planning-artifacts/architecture.md:65]
- Maintain compatibility with currently pinned runtime ranges unless an explicit upgrade story is approved:
  - `@supabase/supabase-js` `^2.43.0` (agent and web)
  - `@langchain/langgraph` `^0.2.0` (agent)
  - `primevue` `^4.0.0` and `vue` `^3.5.0` (web). [Source: apps/agent/package.json:17] [Source: apps/agent/package.json:25] [Source: apps/web/package.json:17] [Source: apps/web/package.json:20] [Source: apps/web/package.json:21]
- Latest ecosystem intelligence (awareness only, not auto-upgrade scope): `@supabase/supabase-js` `2.98.0`, `@langchain/langgraph` `1.2.1`, `primevue` `4.5.4`, `vue` `3.5.29`. Use this only to avoid deprecated patterns while still coding against installed ranges. [Source: octocode_packageSearch run on 2026-03-07]
- Keep all new payload/result contracts and validation centralized in `@ai-assistant/shared` (Zod + generated DB types); do not define duplicate schema contracts inside `apps/agent` or `apps/web`. [Source: _bmad-output/planning-artifacts/architecture.md:297] [Source: _bmad-output/project-context.md:36]
- For any newly introduced `domain_action` (for example `relancing.update`), wire support in both routing layers (`graph.ts` route + node, and `ProcessorRegistry`) or tasks will fail as unsupported. [Source: apps/agent/src/controller/graph.ts:953] [Source: apps/agent/src/processors/ProcessorRegistry.ts:24]

### File Structure Requirements

- Database/persistence changes must be delivered via new timestamped SQL migration(s) under `supabase/migrations/` for normalized relancing updates, idempotency keys, and related RLS/index updates. [Source: _bmad-output/planning-artifacts/architecture.md:114] [Source: _bmad-output/planning-artifacts/architecture.md:153]
- Shared contract updates belong in `packages/shared/src/schemas.ts` (intent/result schemas) and `packages/shared/src/database.types.ts` (generated DB types refresh). [Source: _bmad-output/planning-artifacts/architecture.md:281] [Source: packages/shared/src/schemas.ts:44]
- Inbound channel transport remains in existing adapters and webhook routes:
  - `apps/agent/src/channels/WebChatAdapter.ts`
  - `apps/agent/src/channels/TelegramAdapter.ts`
  - `apps/agent/src/channels/WhatsAppAdapter.ts`
  - `apps/agent/src/routes/webhooks/telegram.ts`
  - `apps/agent/src/routes/webhooks/whatsapp.ts`
  - `apps/agent/src/services/channelRouter.ts`.
  Extend these files for relancing reply routing/deduping rather than adding a second inbound stack. [Source: apps/agent/src/channels/WebChatAdapter.ts:32] [Source: apps/agent/src/channels/TelegramAdapter.ts:93] [Source: apps/agent/src/channels/WhatsAppAdapter.ts:130] [Source: apps/agent/src/routes/webhooks/telegram.ts:60] [Source: apps/agent/src/routes/webhooks/whatsapp.ts:88] [Source: apps/agent/src/services/channelRouter.ts:144]
- Agent execution wiring must follow current graph architecture: add/update processor implementation under `apps/agent/src/processors/`, register in `apps/agent/src/processors/ProcessorRegistry.ts`, and route in `apps/agent/src/controller/graph.ts`. [Source: apps/agent/src/processors/ProcessorRegistry.ts:10] [Source: apps/agent/src/controller/graph.ts:963]
- PM-facing visibility updates should be implemented where current status/outcome mapping already exists: `apps/web/src/views/Dashboard.vue` and associated presentation components such as `apps/web/src/components/activity/OutcomeCard.vue`. [Source: apps/web/src/views/Dashboard.vue:568] [Source: apps/web/src/components/activity/OutcomeCard.vue:60]
- Variance handling: architecture artifacts reference legacy paths such as `taskProcessor.ts`; for Story 5.2, current repo structure (`channelRouter`, `ProcessorRegistry`, `graph.ts`) is source of truth. [Source: _bmad-output/planning-artifacts/architecture.md:268] [Source: apps/agent/src/processors/ProcessorRegistry.ts:10]

### Testing Requirements

- Extend agent-level unit tests for relancing reply parsing, setup-gate escalation (`setup_required`), blocker-pause transitions, and duplicate suppression. Existing channel-router and graph test suites should be the first extension points. [Source: apps/agent/src/services/channelRouter.spec.ts:108] [Source: apps/agent/src/controller/graph.spec.ts:1]
- Add/extend webhook route tests for Telegram and WhatsApp to cover valid signature intake, invalid signature rejection, delivery callback handling, and relancing reply routing semantics. [Source: apps/agent/src/routes/webhooks/telegram.spec.ts:42] [Source: apps/agent/src/routes/webhooks/whatsapp.spec.ts:42]
- Add adapter-level tests (or extend existing ones) to ensure inbound normalization remains stable when introducing relancing routing hints and idempotency keys. [Source: apps/agent/src/channels/WebChatAdapter.spec.ts:1] [Source: apps/agent/src/channels/TelegramAdapter.spec.ts:1] [Source: apps/agent/src/channels/WhatsAppAdapter.spec.ts:1]
- Extend web tests so PM-facing blocker/status outcomes appear correctly in dashboard filters/cards and continue honoring emergency-brake/escalation UI states. [Source: apps/web/src/views/Dashboard.spec.ts:222] [Source: apps/web/src/components/activity/OutcomeCard.spec.ts:74]
- Regression assertions must preserve allowed task status values and avoid introducing unsupported status strings in task writes/results. [Source: apps/agent/src/controller/graph.ts:835] [Source: packages/shared/src/schemas.ts:3]
- Before marking implementation complete, run full workspace verification gates: `pnpm -r test`, `pnpm -r build`, and `pnpm -r lint`. [Source: apps/agent/package.json:8] [Source: apps/agent/package.json:10] [Source: apps/agent/package.json:11] [Source: apps/web/package.json:8] [Source: apps/web/package.json:10] [Source: apps/web/package.json:12] [Source: package.json:7] [Source: package.json:8]

### Previous Story Intelligence

- Story 5.1 established setup-gated relancing as a hard precondition (`setup_status` must be complete before schedule-side effects); Story 5.2 must consume that gate rather than re-implementing alternative setup logic. [Source: _bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md:23]
- Story 5.1 defined reason-code oriented audit semantics (`missing_required_fields`, `blocker_paused`, `duplicate_prevented`, etc.); Story 5.2 should extend the same style for inbound-update decisions. [Source: _bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md:55]
- Story 5.1 reinforced the database-as-queue contract and scheduler service shape (`BriefingScheduler` pattern). Story 5.2 should integrate with that pipeline instead of introducing parallel async infrastructure. [Source: _bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md:105] [Source: _bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md:147]
- Story 5.1 already highlighted stale architecture references (legacy `taskProcessor.ts`); Story 5.2 should continue using current `ProcessorRegistry` + `graph.ts` + channel router structure as canonical. [Source: _bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md:150]

### Git Intelligence Summary

- Recent implementation trend shows safety/perimeter work concentrated in `graph.ts`, Dashboard UI, shared schemas, and Supabase migrations (`720efb1`); Story 5.2 should follow these same integration points and naming patterns. [Source: git log 2026-03-05 `720efb1`]
- Channel/message pipeline maturity is already in active development via Epic 2.9 (`multi-channel messaging adapter routing delivery state`), reducing risk of transport-layer reinvention in Story 5.2. [Source: _bmad-output/implementation-artifacts/sprint-status.yaml:60]
- Repo history indicates artifact synchronization and story context updates are tracked centrally in `_bmad-output`; keep Story 5.2 guidance aligned with current artifact conventions. [Source: git log 2026-03-05 `7d88123`]

### Latest Technical Information

- Current repo runtime ranges: `@supabase/supabase-js` `^2.43.0`, `@langchain/langgraph` `^0.2.0`, `primevue` `^4.0.0`, `vue` `^3.5.0`; Story 5.2 implementation should stay compatible with these installed versions. [Source: apps/agent/package.json:17] [Source: apps/agent/package.json:25] [Source: apps/web/package.json:17] [Source: apps/web/package.json:20] [Source: apps/web/package.json:21]
- Latest registry awareness snapshot (2026-03-07): `@supabase/supabase-js` `2.98.0`, `@langchain/langgraph` `1.2.1`, `primevue` `4.5.4`, `vue` `3.5.29`; no in-story upgrade required, but avoid patterns deprecated in latest docs where backportable alternatives exist. [Source: octocode_packageSearch run on 2026-03-07]
- Practical implication for this story: avoid adopting LangGraph 1.x-only APIs or Supabase client features requiring Node engine jumps while the workspace remains on current pins. [Source: apps/agent/package.json:17]

### Project Context Reference

- Enforce critical project rules from `_bmad-output/project-context.md`: DB `snake_case`, TS `camelCase`, shared types from `packages/shared`, and queue-first agent architecture. [Source: _bmad-output/project-context.md:30]
- Maintain security boundary expectations: PerimeterGuard checks before sensitive LLM/tool execution and strict organization-scoped data access under RLS. [Source: _bmad-output/project-context.md:35] [Source: _bmad-output/project-context.md:50]
- Follow testing and quality guardrails in project context: deterministic mocks for external integrations, maintain component/unit coverage for logic-heavy surfaces, and keep lint/build gates green. [Source: _bmad-output/project-context.md:55] [Source: _bmad-output/project-context.md:63]
- Keep dependency scope disciplined for this story; prefer existing internal helpers and established stack utilities over introducing new third-party packages. [Source: _bmad-output/project-context.md:73]

### Project Structure Notes

- Alignment: Story 5.2 work maps cleanly to existing monorepo boundaries (`apps/agent` for ingestion/processing, `apps/web` for PM visibility, `packages/shared` for contracts, `supabase/migrations` for persistence/RLS).
- Variance: architecture planning docs still mention legacy processor paths; current production structure uses channel adapters + `channelRouter` + graph routing + `ProcessorRegistry`, and this story should follow current code layout.
- Naming and placement: keep SQL objects in `snake_case`, maintain existing TS naming/file conventions, and avoid cross-layer schema duplication.

### References

- `_bmad-output/planning-artifacts/epics.md` (Epic 5 FR4/FR5 story intent, Story 5.2 acceptance baseline)
- `_bmad-output/planning-artifacts/prd.md` (FR4/FR5, FR19, FR21-27 and NFR guardrails)
- `_bmad-output/planning-artifacts/architecture.md` (Database-as-Queue, RLS, shared-contract and migration rules)
- `_bmad-output/project-context.md` (implementation standards, testing/quality rules, anti-pattern boundaries)
- `_bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md` (dependency and continuity intelligence)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (current story ordering/status context)
- `apps/agent/src/services/channelRouter.ts` + `apps/agent/src/channels/*.ts` + `apps/agent/src/routes/webhooks/*.ts` (inbound transport and delivery-state lifecycle)
- `apps/agent/src/controller/graph.ts` + `apps/agent/src/processors/ProcessorRegistry.ts` + `apps/agent/src/controller/nodes/protocol.ts` (execution routing, safety order, blocker baseline)
- `apps/agent/src/processors/MorningBriefProcessor.ts` + `apps/web/src/views/Dashboard.vue` + `apps/web/src/components/activity/OutcomeCard.vue` (PM-facing reporting surfaces)
- `apps/agent/src/services/channelRouter.spec.ts`, `apps/agent/src/routes/webhooks/telegram.spec.ts`, `apps/agent/src/routes/webhooks/whatsapp.spec.ts`, `apps/web/src/views/Dashboard.spec.ts`, `apps/web/src/components/activity/OutcomeCard.spec.ts` (test extension anchors)
- `apps/agent/package.json`, `apps/web/package.json`, `package.json` (verification scripts and pinned dependency baselines)

### Completion Status

- Story implementation and validation complete; ready for review.
- Full workspace gates now pass (`pnpm -r test`, `pnpm -r build`, `pnpm -r lint`) with lint warnings only.

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- Supabase MCP: applied `create_relancing_scheduler_context` + `create_relancing_updates` to project `eoaoiazhsmjbsjazffmx`
- `pnpm --filter @ai-assistant/shared test`
- `pnpm --filter @ai-assistant/agent test`
- `pnpm -r test`
- `pnpm --filter @ai-assistant/agent test -- src/processors/RelancingUpdateProcessor.spec.ts src/processors/MorningBriefProcessor.spec.ts src/controller/graph.spec.ts`
- `pnpm --filter @ai-assistant/web test -- src/views/Dashboard.spec.ts`
- `pnpm -r test`
- `pnpm -r build`
- `pnpm -r lint` (passes with warnings only)

### Completion Notes List

- Added normalized relancing update persistence (`relancing_updates`) and append-only trace events (`relancing_update_events`) with org-scoped RLS + indexes.
- Extended shared contracts with `RelancingUpdateSchema` and corresponding DB types.
- Added shared unit/contract coverage for the new schema and migration.
- Added explicit webhook routing override via `domain_action` query param and inbound dedupe keyed by `(org, channel, external_message_id, domain_action)`.
- Completed `relancing.update` graph/processor handling with setup-gated linkage, ambiguity escalation, blocker pause semantics, emergency-brake coverage, and append-only `agent_activity_log` audit traces.
- Extended `MorningBriefProcessor` to ingest normalized relancing updates alongside summarized threads so PM reporting surfaces share a single traceable source pipeline.
- Added Dashboard regression coverage for relancing blocker topic mapping and Morning Brief regression coverage for relancing-source aggregation.
- Added workspace ESLint flat config and dependencies, then fixed pre-existing lint/build blockers across agent/web so repo validation gates are green.
- Full workspace gates pass: `pnpm -r test`, `pnpm -r build`, and `pnpm -r lint` (warnings only, no errors).

### File List

- Story-scoped files only. Additional workspace changes from unrelated parallel efforts are intentionally excluded from this list.

- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `supabase/migrations/20260308000000_create_relancing_updates.sql`
- `packages/shared/src/schemas.ts`
- `packages/shared/src/database.types.ts`
- `packages/shared/tests/schemas.spec.ts`
- `packages/shared/tests/relancing-updates-migration.spec.ts`
- `apps/agent/src/routes/webhooks/telegram.ts`
- `apps/agent/src/routes/webhooks/telegram.spec.ts`
- `apps/agent/src/routes/webhooks/whatsapp.ts`
- `apps/agent/src/routes/webhooks/whatsapp.spec.ts`
- `apps/agent/src/services/channelRouter.ts`
- `apps/agent/src/services/channelRouter.spec.ts`
- `apps/agent/src/processors/RelancingUpdateProcessor.ts`
- `apps/agent/src/processors/RelancingUpdateProcessor.spec.ts`
- `apps/agent/src/processors/MorningBriefProcessor.ts`
- `apps/agent/src/processors/MorningBriefProcessor.spec.ts`
- `apps/agent/src/controller/graph.ts`
- `apps/agent/src/controller/graph.spec.ts`
- `apps/web/src/views/Dashboard.vue`
- `apps/web/src/views/Dashboard.spec.ts`
- `apps/web/src/components/SecurityPerimeterSettings.vue`
- `apps/web/src/views/Onboarding.vue`
- `apps/web/src/views/Settings.vue`
- `apps/web/tailwind.config.ts`
- `apps/agent/src/controller/nodes/protocol.ts`
- `apps/agent/src/processors/BaseProcessor.spec.ts`
- `apps/agent/src/processors/ProtocolGenerateProcessor.spec.ts`
- `apps/agent/src/processors/ThreadSummarizer.ts`
- `apps/agent/src/processors/ThreadSummarizer.spec.ts`
- `apps/agent/src/services/BriefingScheduler.ts`
- `apps/agent/src/services/googleAuth.ts`
- `apps/agent/src/services/mcp.ts`
- `apps/agent/src/services/mcp.error.spec.ts`
- `apps/agent/src/processors/CalendarCreateProcessor.ts`
- `apps/agent/src/processors/CalendarCreateProcessor.spec.ts`
- `apps/agent/src/processors/EmailDraftProcessor.ts`
- `apps/agent/src/processors/EmailDraftProcessor.spec.ts`
- `apps/agent/src/processors/EmailTriageProcessor.spec.ts`
- `apps/web/src/components/messages/MessagesLayout.vue`
- `apps/web/src/views/MessageCategoryView.vue`
- `apps/web/src/views/MessageTopicView.vue`
- `apps/web/src/components/security/AgencyPerimeterBoard.spec.ts`
- `apps/web/src/components/activity/OutcomeCard.vue`
- `eslint.config.mjs`
- `package.json`
- `apps/web/package.json`

## Change Log

- 2026-03-09: Finished Story 5.2 processor/reporting/test coverage for relancing updates.
- 2026-03-09: Resolved repo-wide build and lint blockers, added ESLint flat config/tooling, and re-ran full validation gates successfully.
