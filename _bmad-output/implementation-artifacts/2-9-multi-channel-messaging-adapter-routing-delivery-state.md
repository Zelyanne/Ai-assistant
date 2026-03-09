# Story 2.9: multi-channel-messaging-adapter-routing-delivery-state

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Developer,
I want a unified multi-channel messaging adapter and routing layer,
so that web chat, Telegram, and WhatsApp interactions flow through one secure execution pipeline with consistent delivery lifecycle tracking.

## Acceptance Criteria

1. [x] Inbound messages from web/telegram/whatsapp are normalized into one task envelope containing at least `channel`, `external_message_id`, `thread_id`, `organization_id`, and `user_id`.
2. [x] Outbound responses/actions are dispatched through channel-specific sender adapters and persist delivery state transitions.
3. [x] Provider/API failures apply retry/backoff policy and persist terminal failure details to task result and audit logs.
4. [x] Perimeter and confidence escalation controls are enforced identically for all channels before send/execute actions.
5. [x] Channel-level observability is available for audit/debug (channel metadata in task/audit artifacts and traceable correlation IDs).

## Tasks / Subtasks

- [x] Define shared channel contracts and validation schemas (AC: 1, 5)
  - [x] Add channel envelope schemas in `packages/shared/src/schemas.ts` (channel enum, normalized inbound envelope, delivery event envelope).
  - [x] Keep DB-facing naming in `snake_case` for payload/result interfaces where applicable.
  - [x] Re-export new types through `packages/shared/src/index.ts`.
- [x] Implement adapter abstraction and registry (AC: 1, 2, 4)
  - [x] Add `apps/agent/src/channels/ChannelAdapter.ts` interface (`normalizeInbound`, `sendOutbound`, `validateWebhook`, `mapDeliveryEvent`).
  - [x] Add `apps/agent/src/channels/ChannelAdapterRegistry.ts` for `web`, `telegram`, `whatsapp` adapters.
  - [x] Add `apps/agent/src/channels/WebChatAdapter.ts` as baseline adapter for existing internal flows.
- [x] Implement Telegram and WhatsApp adapter stubs with secure webhook validation (AC: 1, 2, 4)
  - [x] Add `apps/agent/src/channels/TelegramAdapter.ts` using webhook secret token validation.
  - [x] Add `apps/agent/src/channels/WhatsAppAdapter.ts` with provider signature validation path and delivery mapping.
  - [x] Add route handlers under `apps/agent/src/routes/webhooks/` and wire in `apps/agent/src/index.ts`.
- [x] Integrate normalized routing with task pipeline (AC: 1, 4)
  - [x] Add channel routing orchestration service (`apps/agent/src/services/channelRouter.ts`) to create queue tasks using normalized envelope.
  - [x] Ensure created tasks preserve existing `domain_action` conventions (`domain.action`) and existing graph execution path.
  - [x] Ensure confidence and perimeter checks remain centralized in graph/perimeter guard and are not bypassed by channel adapters.
- [x] Implement delivery state transitions and retry policy (AC: 2, 3, 5)
  - [x] Define delivery states and transitions in adapter layer (`queued`, `sent`, `delivered`, `failed`, terminal error details).
  - [x] Persist correlation IDs (`external_message_id`, provider response IDs) in task result payload.
  - [x] Implement bounded retry/backoff with idempotency guard per provider message ID.
- [x] Extend audit and traceability (AC: 3, 5)
  - [x] Log channel metadata and delivery transitions to `agent_activity_log.reasoning_trace`/`citations` payloads.
  - [x] Ensure escalations include channel context and preserve prior escalation payload structure.
- [x] Add comprehensive tests (AC: 1-5)
  - [x] Unit tests for each adapter normalization/validation behavior.
  - [x] Unit tests for delivery transition mapping and retry decisions.
  - [x] Integration tests for webhook -> normalized task -> queue insert -> graph invoke path.
  - [x] Regression tests confirming confidence/perimeter escalation still triggers for restricted/low-confidence channel actions.

## Dev Notes

### Story Context and Scope

- This story was added through approved Correct-Course change control and is now the first backlog item.
- Scope is backend foundation for channel normalization, routing, delivery lifecycle, and security guardrails.
- Channel implementation depth in this story should establish reliable adapter/routing primitives; end-user channel UX flows are handled in Epic 6 stories.

### Epic Context

- Epic 2 objective remains the core orchestration layer for all channels and autonomous execution.
- This story is the required enabler for 6.1 (chat execution UX), 6.6 (Telegram), and 6.7 (WhatsApp).

### Relevant Existing Implementation (Do Not Reinvent)

- Queue/event pipeline already exists:
  - `apps/agent/src/index.ts` subscribes to `public:tasks` inserts with `status=queued` and invokes graph.
  - `apps/agent/src/controller/graph.ts` handles initialization, perimeter checks, confidence gate, escalation, processor execution, and finalization.
- Existing processor registration pattern exists in `apps/agent/src/processors/ProcessorRegistry.ts`.
- Existing escalation contract exists in:
  - `apps/agent/src/controller/nodes/escalate.ts`
  - `apps/agent/src/controller/escalation.ts`
  - `packages/shared/src/schemas.ts` (`EscalationResultSchema`, `TaskStatusSchema`).

### Technical Requirements

- Maintain existing task lifecycle semantics and do not break graph routing.
- Preserve `domain_action` regex contract (`^[a-z]+\.[a-z]+$`) from shared schemas.
- Keep immutable audit behavior: append logs, do not mutate historical entries.
- Do not bypass `PerimeterGuard` checks for execution-mode channel actions.
- Ensure channel metadata is persisted in task/result/audit JSON payloads without violating existing DB constraints.

### Architecture Compliance

- Follow architecture event-driven model: channel webhook -> normalization -> `tasks` insert (`queued`) -> graph.
- Follow strict naming conventions:
  - DB fields/interfaces: `snake_case`
  - TS code: `camelCase` and `PascalCase` types.
- Use `packages/shared` types/schemas for cross-app contracts.
- Keep security perimeter before LLM/tool execution.
- Keep escalation behavior aligned with Story 2.8 patterns.

### Library / Framework Requirements (Context7 + Octocode)

- Telegram (Telegraf):
  - Verified `secretToken` webhook support via Telegraf webhook APIs (`webhookCallback(..., { secretToken })` and launch webhook config).
  - Prefer explicit webhook secret validation and deterministic update handling.
- Twilio (WhatsApp path):
  - `messages.create` supports `statusCallback` in Twilio Node API for delivery lifecycle tracking.
  - Webhook signature helpers are available (`validateRequest`, `validateRequestWithBody`, Express middleware wrapper).
- Dependency guardrail:
  - Project context requires avoiding new dependencies by default; if adding Telegraf/Twilio runtime deps, capture explicit rationale and keep footprint minimal.

### File Structure Requirements

- Add new channel code under agent app only:
  - `apps/agent/src/channels/ChannelAdapter.ts`
  - `apps/agent/src/channels/ChannelAdapterRegistry.ts`
  - `apps/agent/src/channels/WebChatAdapter.ts`
  - `apps/agent/src/channels/TelegramAdapter.ts`
  - `apps/agent/src/channels/WhatsAppAdapter.ts`
  - `apps/agent/src/services/channelRouter.ts`
  - `apps/agent/src/routes/webhooks/telegram.ts`
  - `apps/agent/src/routes/webhooks/whatsapp.ts`
  - `apps/agent/src/channels/*.spec.ts`
- Shared contracts in:
  - `packages/shared/src/schemas.ts`
  - `packages/shared/src/index.ts`

### Testing Requirements

- Use Vitest for unit/integration tests.
- Mandatory coverage in this story:
  - Adapter normalization and webhook validation behaviors.
  - Delivery state transition and retry/backoff branching.
  - Regression for escalation/perimeter behavior from Story 2.8.
  - Route-level tests for webhook handlers (bad signature -> reject; valid signature -> enqueue).

### Previous Story Intelligence (2.8)

- Confidence and ambiguity gates are already codified and should stay centralized in graph logic.
- Escalation status uses `escalation` path (not only `error`) in current implementation.
- Existing tests around graph confidence routing should be extended, not duplicated with divergent logic.

### Git Intelligence Summary

- Recent implementation patterns emphasize:
  - Graph-centered orchestration and safety controls (`graph.ts`, escalation nodes, safety control service).
  - Registry-based processor wiring.
  - Strong test-first or test-paired updates across agent and shared packages.
- Reuse these patterns for channel adapter registration and routing to avoid bespoke execution paths.

### Latest Technical Information

- Telegram Bot API webhook security supports secret token header (`X-Telegram-Bot-Api-Secret-Token`) and webhook transport constraints; adapter must verify this.
- Telegraf framework supports webhook secret token integration directly in runtime APIs.
- Twilio WhatsApp flow supports status callbacks and explicit webhook signature validation helpers; use these for delivery-state integrity and spoofing protection.
- WhatsApp business messaging requires user opt-in and session-window semantics; adapter should preserve room for policy checks in outbound execution.

### Project Structure Notes

- Respect existing monorepo boundaries:
  - Agent runtime logic stays in `apps/agent`.
  - Cross-app contracts stay in `packages/shared`.
- Do not introduce frontend changes in this story except shape compatibility notes in payload/result.

### References

- [Source: `_bmad-output/implementation-artifacts/sprint-status.yaml`]
- [Source: `_bmad-output/planning-artifacts/epics.md`]
- [Source: `_bmad-output/planning-artifacts/prd.md`]
- [Source: `_bmad-output/planning-artifacts/architecture.md`]
- [Source: `_bmad-output/project-context.md`]
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-03-05.md`]
- [Source: `_bmad-output/implementation-artifacts/2-8-confidence-evaluation-escalation-logic.md`]
- [Source: `apps/agent/src/index.ts`]
- [Source: `apps/agent/src/controller/graph.ts`]
- [Source: `apps/agent/src/controller/nodes/escalate.ts`]
- [Source: `apps/agent/src/processors/ProcessorRegistry.ts`]
- [Source: `packages/shared/src/schemas.ts`]
- [External Source: Context7 `/telegraf/telegraf`]
- [External Source: Context7 `/twilio/twilio-node`]
- [External Source: Octocode `telegraf/telegraf` and `twilio/twilio-node` repository code]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- Context7 research completed for Telegram and Twilio integration patterns.
- Octocode repository checks completed for Telegraf webhook secret handling and Twilio validation/status callback API surfaces.
- Context7 consulted: `/telegraf/telegraf` webhook secret token handling and `/twilio/twilio-node` webhook validation and `statusCallback` guidance.
- Octocode consulted: `telegraf/telegraf` `webhookCallback(..., { secretToken })` path and `twilio/twilio-node` webhook validation helper sources.
- Validation executed: `pnpm --filter @ai-assistant/agent test` and `pnpm -r --if-present test`.
- Quality gate note: `pnpm --filter @ai-assistant/agent lint` is configured but fails in this environment because `eslint` is unavailable (`sh: eslint: command not found`).

### Completion Notes List

- Story created from approved Correct-Course proposal and aligned with current architecture and codebase patterns.
- Story is optimized for implementation guardrails and regression prevention.
- Added shared multi-channel schemas and delivery/retry contracts with `snake_case` DB-facing envelopes.
- Implemented channel adapter abstraction, default registry, and concrete adapters (`web`, `telegram`, `whatsapp`) including secure webhook validation paths.
- Added webhook routes and routing orchestration service to normalize inbound payloads, queue tasks, persist delivery transitions, and append audit artifacts with correlation IDs.
- Preserved centralized perimeter/confidence enforcement by routing all channel traffic through queued tasks and existing graph execution.
- Added adapter/unit/integration/regression tests for normalization, validation, retry mapping, webhook routing, queue-to-graph invocation, and channel-aware escalation behavior.

### File List

- `_bmad-output/implementation-artifacts/2-9-multi-channel-messaging-adapter-routing-delivery-state.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/shared/src/schemas.ts`
- `apps/agent/src/channels/ChannelAdapter.ts`
- `apps/agent/src/channels/ChannelAdapterRegistry.ts`
- `apps/agent/src/channels/ChannelAdapterRegistry.spec.ts`
- `apps/agent/src/channels/TelegramAdapter.ts`
- `apps/agent/src/channels/TelegramAdapter.spec.ts`
- `apps/agent/src/channels/WebChatAdapter.ts`
- `apps/agent/src/channels/WebChatAdapter.spec.ts`
- `apps/agent/src/channels/WhatsAppAdapter.ts`
- `apps/agent/src/channels/WhatsAppAdapter.spec.ts`
- `apps/agent/src/channels/retryPolicy.ts`
- `apps/agent/src/controller/graph.ts`
- `apps/agent/src/controller/graph.spec.ts`
- `apps/agent/src/index.ts`
- `apps/agent/src/routes/webhooks/telegram.ts`
- `apps/agent/src/routes/webhooks/telegram.spec.ts`
- `apps/agent/src/routes/webhooks/whatsapp.ts`
- `apps/agent/src/routes/webhooks/whatsapp.spec.ts`
- `apps/agent/src/services/channelRouter.ts`
- `apps/agent/src/services/channelRouter.spec.ts`
- `apps/agent/src/processors/ChannelSendProcessor.ts`
- `apps/agent/src/processors/ChannelSendProcessor.spec.ts`
- `apps/agent/src/processors/ProcessorRegistry.ts`
- `apps/agent/src/services/taskSubscriber.ts`
- `apps/agent/src/services/taskSubscriber.spec.ts`

### Change Log

- 2026-03-06: Implemented Story 2.9 multi-channel adapter routing foundation, delivery state persistence, audit traceability extensions, and comprehensive automated coverage.
