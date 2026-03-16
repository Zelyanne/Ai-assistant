---
title: 'User-Initiated Channel Commands Without Escalation + Social Setup Settings'
slug: 'user-initiated-channel-commands-no-escalation-social-setup'
created: '2026-03-13'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Vue 3', 'TypeScript', 'PrimeVue', 'Pinia', 'Supabase', 'Node.js', 'LangGraph', 'Vitest']
files_to_modify: ['apps/web/src/views/Settings.vue', 'apps/web/src/components/WorkspaceIntegration.vue', 'apps/web/src/composables/useCommandCenter.ts', 'apps/web/src/composables/useAuth.ts', 'apps/agent/src/controller/graph.ts', 'apps/agent/src/services/channelRouter.ts']
code_patterns: ['Database-as-Queue task orchestration', 'Adapter registry for channels', 'LangGraph node + conditional edge routing', 'Payload-driven confidence/perimeter escalation gates', 'Supabase table subscriptions for realtime timeline state']
test_patterns: ['Vitest unit tests with hoisted mocks for Supabase/useAgent', 'Graph integration-style tests with in-memory DB maps', 'Channel adapter contract tests (normalizeInbound/sendOutbound/mapDeliveryEvent)', 'Service tests validating routing and JSON payload persistence']
---

# Tech-Spec: User-Initiated Channel Commands Without Escalation + Social Setup Settings

**Created:** 2026-03-13

## Overview

### Problem Statement

Users cannot see a dedicated Social setup area in Settings for Telegram and WhatsApp, the Google Workspace card does not clearly communicate the full permission scope, and user-initiated commands can still surface escalation/confirmation behavior in Command Center flows even though those requests are explicitly initiated by the user.

### Solution

Add a dedicated Social section in Settings for Telegram and WhatsApp setup guidance and status, align Google Workspace UI copy with actual required scopes, and enforce no-escalation/no-confirmation behavior for user-initiated requests from Command Center, Telegram, and WhatsApp while preserving escalation for automated tasks created from email-analysis pipelines.

### Scope

**In Scope:**
- Settings UI: add Social setup section for Telegram and WhatsApp with clear configuration requirements.
- WhatsApp setup clarity: document both supported modes (Meta Cloud API and Twilio) and show required fields per mode.
- Google Workspace card update: show full practical scope (Gmail/Calendar/Drive/Docs/Sheets/Slides) and rationale.
- Routing/guardrails behavior: bypass escalation and extra confirmation for user-initiated commands from web Command Center, Telegram, and WhatsApp.
- Keep escalation logic for automated email-derived tasks.

**Out of Scope:**
- Rebuilding Telegram/WhatsApp channel adapters from scratch.
- Adding new channels beyond web/telegram/whatsapp.
- Reworking tenant-level authorization model.

## Context for Development

### Codebase Patterns

- Database-as-Queue task processing and channel routing through adapters.
- Command Center timeline/state model with explicit task state mapping.
- Existing multi-channel support with Telegram and WhatsApp already implemented in backend.
- Google OAuth + scope-gated worker capabilities for Workspace actions.
- Channel routing rule already maps Telegram/WhatsApp inbound `thread.action` to `assistant.command` in `channelRouter`.
- Escalation currently happens in multiple layers: frontend pre-submit high-risk confirmation, perimeter check, confidence gate, and processor outcome handling in `graph`.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/web/src/views/Settings.vue` | Settings page where Social section will be surfaced |
| `apps/web/src/components/WorkspaceIntegration.vue` | Google Workspace card and scope/permission copy |
| `apps/web/src/composables/useCommandCenter.ts` | User command submission, risk-confirmation, and timeline state behavior |
| `apps/web/src/composables/useAuth.ts` | Web OAuth scopes currently shown during Supabase Google sign-in |
| `apps/agent/src/channels/ChannelAdapterRegistry.ts` | Existing Telegram/WhatsApp adapter wiring and expected env keys |
| `apps/agent/src/channels/WhatsAppAdapter.ts` | Dual-provider WhatsApp support (Meta/Twilio) and required config |
| `apps/agent/src/channels/TelegramAdapter.ts` | Telegram setup requirements and webhook validation |
| `apps/agent/src/services/channelRouter.ts` | Channel inbound mapping used for user-initiated command routing |
| `apps/agent/src/controller/graph.ts` | Central escalation/route policy for task execution |
| `apps/agent/src/services/googleAuth.ts` | Backend canonical Google Workspace OAuth scope set |
| `apps/web/src/composables/useCommandCenter.spec.ts` | Coverage for confirmation and queue behavior in Command Center |
| `apps/agent/src/controller/graph.spec.ts` | Coverage for graph planning/execution and escalation states |
| `apps/agent/src/services/channelRouter.spec.ts` | Coverage for inbound routing + delivery event persistence |
| `apps/agent/src/channels/TelegramAdapter.spec.ts` | Telegram validation and delivery mapping tests |
| `apps/agent/src/channels/WhatsAppAdapter.spec.ts` | WhatsApp validation and normalization tests |

### Technical Decisions

- Treat messages from Command Center, Telegram, and WhatsApp as user-initiated and not escalation candidates by default.
- Restrict escalation behavior to automated tasks generated by email analysis flows.
- Keep WhatsApp support for both Meta and Twilio; Social setup UX must explain both paths.
- Keep the implementation aligned with existing adapters and registry conventions instead of introducing new channel abstractions.
- Use backend `googleAuth` scope list as source of truth and align web copy/scope declaration to remove mismatch.
- Prefer low-impact updates in existing components/composables instead of introducing new settings route/page.

## Implementation Plan

### Tasks

- [x] Task 1: Add dedicated Social Integrations section in Settings
  - File: `apps/web/src/views/Settings.vue`
  - Action: Add a new section for Telegram and WhatsApp setup that is separate from Google Workspace and Email Ingestion.
  - Notes: Surface setup requirements and current connection hints by provider (`telegram`, `whatsapp`) without replacing existing backend adapters.

- [x] Task 2: Expose WhatsApp setup paths clearly (Meta + Twilio)
  - File: `apps/web/src/views/Settings.vue`
  - Action: In the WhatsApp part of Social Integrations, show required credentials and webhook requirements for both Meta Cloud API and Twilio modes.
  - Notes: Keep this as setup UX/instructions and status indicators, aligned with existing env-driven adapter behavior.

- [x] Task 3: Align Google Workspace UI copy with real capability scope
  - File: `apps/web/src/components/WorkspaceIntegration.vue`
  - Action: Update capability bullets and explanatory text to explicitly mention Gmail, Calendar, Drive, Docs, Sheets, and Slides access intent.
  - Notes: Clarify why each capability is needed and avoid scope wording that implies less or more than current implementation.

- [x] Task 4: Align web OAuth scope declaration with backend scope policy
  - File: `apps/web/src/composables/useAuth.ts`
  - Action: Update Supabase Google OAuth scope string so the web sign-in flow requests the same operational scope set expected by backend workers.
  - Notes: Keep `access_type=offline` and `prompt=consent` behavior unchanged.

- [x] Task 5: Remove Command Center pre-submit confirmation/escalation gate for user-initiated commands
  - File: `apps/web/src/composables/useCommandCenter.ts`
  - Action: Remove (or bypass) high-risk confirmation blocking so user-submitted commands are always queued directly.
  - Notes: Preserve timeline behavior (`intent_preview` -> `queued` -> realtime updates) and keep error handling intact.

- [x] Task 6: Mark inbound Telegram/WhatsApp tasks as explicitly user-initiated
  - File: `apps/agent/src/services/channelRouter.ts`
  - Action: Include a deterministic payload marker (for example `user_initiated: true` and source channel metadata) when enqueuing inbound user channel messages.
  - Notes: This marker becomes the backend contract used to bypass escalation only for direct user requests.

- [x] Task 7: Enforce no-escalation path for user-initiated command channels in graph routing
  - File: `apps/agent/src/controller/graph.ts`
  - Action: Add an explicit guard that bypasses confidence/perimeter escalation for user-initiated `assistant.command` requests coming from `web`, `telegram`, or `whatsapp`.
  - Notes: Keep escalation behavior unchanged for automated email-analysis derived tasks (`email.triage`, `email.summarize`, `thread.action`, and related automated flows).

- [x] Task 8: Update tests for new no-escalation + setup behavior
  - File: `apps/web/src/composables/useCommandCenter.spec.ts`
  - Action: Replace confirmation-required assertions with direct-queue expectations for previously high-risk command text.
  - Notes: Keep existing realtime/timeline assertions.
  - File: `apps/agent/src/services/channelRouter.spec.ts`
  - Action: Assert inbound Telegram/WhatsApp payload includes user-initiated marker used by graph policy.
  - Notes: Maintain existing duplicate suppression and delivery persistence assertions.
  - File: `apps/agent/src/controller/graph.spec.ts`
  - Action: Add coverage showing user-initiated channel commands do not end in `escalation` from confidence/perimeter gates, while automated flows still can.
  - Notes: Focus on regression coverage for guard boundaries.

### Acceptance Criteria

- [x] AC 1: Given a user opens Settings, when they navigate integration controls, then they see a dedicated Social Integrations section with separate Telegram and WhatsApp setup guidance.
- [x] AC 2: Given a user reviews WhatsApp setup, when they open the WhatsApp configuration block, then both Meta Cloud API and Twilio setup requirements are clearly visible and distinguishable.
- [x] AC 3: Given a user reviews Google integration info, when the Google Workspace card is displayed, then it communicates the full operational scope intent for Gmail, Calendar, Drive, Docs, Sheets, and Slides and why the app needs them.
- [x] AC 4: Given a user submits a command from Command Center, when the command text includes high-risk keywords, then the command is still queued directly without confirmation or escalation prompt.
- [x] AC 5: Given a user sends a command from Telegram or WhatsApp, when the inbound message is normalized and enqueued, then task payload metadata identifies it as user-initiated and routes it through `assistant.command` execution.
- [x] AC 6: Given a user-initiated command from `web`/`telegram`/`whatsapp`, when confidence is low or ambiguity flags are present, then the graph does not transition that task to `escalation` solely for those confidence/perimeter gates.
- [x] AC 7: Given an automated task generated from email-analysis flows, when confidence/perimeter rules are violated, then escalation behavior remains active and task status can still become `escalation`.
- [x] AC 8: Given failures in social setup data loading or save attempts, when an operation fails, then the UI surfaces a clear error state/message without breaking other settings sections.

## Additional Context

### Dependencies

- Supabase tables and RLS for `workspace_integrations`, `tasks`, and related conversation/task entities.
- Existing channel adapter infrastructure (`TelegramAdapter`, `WhatsAppAdapter`, `ChannelAdapterRegistry`) and webhook routes.
- Existing LangGraph controller pipeline in `apps/agent/src/controller/graph.ts`.
- Google OAuth scope handling across web sign-in (`useAuth.ts`) and backend token/scopes processing (`googleAuth.ts`, MCP readiness checks).

### Testing Strategy

- Web unit tests (Vitest):
  - Update `useCommandCenter.spec.ts` to validate direct queue behavior for commands previously requiring confirmation.
  - Add/adjust Settings component tests if introduced for Social Integrations rendering and error states.
- Agent/service tests (Vitest):
  - Extend `channelRouter.spec.ts` to verify user-initiated payload markers on Telegram/WhatsApp inbound tasks.
  - Extend `graph.spec.ts` to prove no-escalation for user-initiated channels and preserved escalation for automated flows.
- Manual verification:
  - Validate Settings UX for Social + Google copy.
  - Trigger command submissions from Command Center, Telegram, and WhatsApp and confirm no escalation prompt/status for direct user requests.
  - Trigger an automated email-analysis flow and confirm escalation still occurs when confidence/perimeter conditions require it.

### Notes

- Primary risk is over-broad bypass logic; implementation must scope bypass to explicit user-initiated channel markers and `assistant.command` pathway only.
- Existing behavior includes multiple escalation layers (frontend confirmation + backend confidence/perimeter checks); all relevant layers must be updated consistently to avoid partial regressions.
- Social setup UX is intentionally additive in Settings and should not require replacing existing env-based adapter wiring in this iteration.
- Future consideration: migrate social credentials from env-only to secure org-scoped encrypted storage if operationally required; this is out of current scope.

## Review Notes

- Adversarial review completed
- Findings: 12 total, 7 fixed, 5 skipped
- Resolution approach: auto-fix
