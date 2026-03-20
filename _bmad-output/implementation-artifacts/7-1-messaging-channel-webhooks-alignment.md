# Story 7.1: Messaging Channel Webhooks Alignment

Status: in-progress

Story ID: 7.1
Story Key: 7-1-messaging-channel-webhooks-alignment

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a User,
I want to interact with the agent via WhatsApp/Telegram webhooks,
So that I can delegate tasks from the apps I use most and receive responses via the same channel.

## Acceptance Criteria

1. **Webhook Endpoint Configuration:**
   - **Given** the Agent Controller is deployed to Hetzner
   - **When** a supported WhatsApp provider (Evolution API, Meta Cloud API, or Twilio) and Telegram are configured with the webhook URL
   - **Then** the webhook endpoints at `/webhooks/whatsapp` and `/webhooks/telegram` are publicly accessible
   - **And** provider-specific verification/registration can target `/webhooks/whatsapp` with the correct secrets or challenge flow.

2. **Platform-Specific Webhook Validation:**
   - **Given** an inbound webhook request from a supported WhatsApp provider or Telegram
   - **When** the `WhatsAppAdapter` or `TelegramAdapter` processes the request
   - **Then** WhatsApp requests verify `x-evolution-webhook-secret`, `x-whatsapp-signature`, or `x-twilio-signature` depending on provider
   - **And** Telegram requests verify `x-telegram-bot-api-secret-token` header
   - **And** invalid requests are rejected with 401 Unauthorized.

3. **Message Normalization:**
   - **Given** a validated inbound webhook payload
   - **When** the appropriate adapter processes it
   - **Then** the payload is normalized to `NormalizedInboundEnvelope` with: `channel`, `thread_id`, `message_text`, `sender_id`, `timestamp`
   - **And** platform-specific metadata is preserved in `channel_metadata`.

4. **Routing to Agent Controller:**
   - **Given** a normalized `NormalizedInboundEnvelope`
   - **When** the `ChannelRouterService` processes it
   - **Then** messages are routed to `assistant.command` for conversational processing
   - **And** delivery events are routed to handle delivery status updates.

5. **Outbound Message Delivery:**
   - **Given** the Agent needs to respond via WhatsApp or Telegram
   - **When** a `channel.send` task is dispatched to the appropriate adapter
   - **Then** the message is sent via the configured platform's Bot API (Evolution API, Meta Cloud API, Twilio, or Telegram Bot API)
   - **And** delivery status is recorded in the task result and `agent_activity_log`.

6. **Environment Configuration Documentation:**
   - **Given** a fresh deployment environment
   - **When** the `.env.example` file is reviewed
   - **Then** all required webhook configuration variables are documented with setup instructions
   - **And** the README includes webhook setup URLs for both platforms.

## Tasks / Subtasks

- [x] 1) WhatsApp Webhook Endpoint Implementation (Multi-Provider) (AC: 1, 2)
  - [x] `apps/agent/src/routes/webhooks/whatsapp.ts` - Express route with Evolution, Meta, and Twilio validation paths
  - [x] `x-evolution-webhook-secret` verification for Evolution callbacks
  - [x] `x-whatsapp-signature` verification for Meta callbacks
  - [x] `x-twilio-signature` verification for Twilio callbacks
  - [x] Ignore self-authored `messages.upsert` callbacks to prevent echo loops
  - [x] GET endpoint for Meta verification challenge and operator health/edge verification
  - [x] POST endpoint for inbound webhook processing
  - [Source: `apps/agent/src/routes/webhooks/whatsapp.ts`]

- [x] 2) Telegram Webhook Endpoint Implementation (AC: 1, 2)
  - [x] `apps/agent/src/routes/webhooks/telegram.ts` - Express route with secret token validation
  - [x] `x-telegram-bot-api-secret-token` header verification
  - [x] Support for `message`, `edited_message`, and `callback_query` updates
  - [Source: `apps/agent/src/routes/webhooks/telegram.ts`]

- [x] 3) WhatsApp Adapter Implementation (Multi-Provider) (AC: 3, 5)
  - [x] `apps/agent/src/channels/WhatsAppAdapter.ts` - Full adapter implementation
  - [x] provider selection supports `evolution`, `meta`, `twilio`, and `auto`
  - [x] `normalizeInbound` - Handles Evolution `messages.upsert` payloads
  - [x] `normalizeInbound` - Handles Meta and Twilio inbound payloads
  - [x] `sendOutbound` - Uses Evolution `POST /message/sendText/{instance}` with `apikey` auth
  - [x] `sendOutbound` - Supports Meta Cloud API and Twilio outbound delivery
  - [x] `mapDeliveryEvent` - Maps Evolution `send.message`, `send.message.update`, and `messages.update` webhooks
  - [x] `mapDeliveryEvent` - Maps Meta/Twilio delivery updates
  - [x] `evaluateRetry` - Bounded retry policy for transient failures
  - [Source: `apps/agent/src/channels/WhatsAppAdapter.ts`]

- [x] 4) Telegram Adapter Implementation (AC: 3, 5)
  - [x] `apps/agent/src/channels/TelegramAdapter.ts` - Full adapter implementation
  - [x] `normalizeInbound` - Handles message, edited_message, callback_query
  - [x] `sendOutbound` - Telegram Bot API with internal retry loop
  - [x] `mapDeliveryEvent` - Maps delivery events
  - [x] `evaluateRetry` - Bounded retry policy
  - [Source: `apps/agent/src/channels/TelegramAdapter.ts`]

- [x] 5) Channel Router Integration (AC: 4)
  - [x] `apps/agent/src/services/channelRouter.ts` - Routes inbound messages to processors
  - [x] `apps/agent/src/controller/graph.ts` - `channel.send` in PROXY_EXECUTION_ACTIONS
  - [x] `apps/agent/src/index.ts` - Webhook routers registered at lines 48-49
  - [Source: `apps/agent/src/index.ts`, `apps/agent/src/controller/graph.ts`]

- [x] 6) Environment Configuration (AC: 6)
  - [x] Verify `apps/agent/.env.example` includes:
    - `WHATSAPP_PROVIDER` - Selects `auto`, `evolution`, `meta`, or `twilio`
    - `EVOLUTION_API_BASE_URL` - Evolution API server URL
    - `EVOLUTION_API_KEY` - Evolution API auth header value
    - `EVOLUTION_INSTANCE_NAME` - Evolution instance bound to outbound sends/webhooks
    - `EVOLUTION_WEBHOOK_SECRET` - Shared secret forwarded as `x-evolution-webhook-secret`
    - `WHATSAPP_API_KEY` - Meta Cloud API access token
    - `WHATSAPP_PHONE_NUMBER_ID` - Meta Cloud API phone number
    - `WHATSAPP_WEBHOOK_SECRET` - Meta/Twilio webhook signing secret / verify token
    - `TWILIO_ACCOUNT_SID` - Twilio account SID
    - `TWILIO_AUTH_TOKEN` - Twilio auth token
    - `TWILIO_WHATSAPP_PHONE_NUMBER` - Twilio WhatsApp sender number
    - `TELEGRAM_BOT_TOKEN` - Telegram bot authentication
    - `TELEGRAM_WEBHOOK_SECRET` - Telegram secret token for webhook validation
  - [x] Add setup instructions to `README.md` for:
    - Evolution API webhook configuration
    - Meta Developer Dashboard webhook configuration
    - Twilio WhatsApp configuration
    - Telegram BotFather webhook setup

- [ ] 7) Integration Testing (AC: 6)
  - [x] `apps/agent/src/channels/WhatsAppAdapter.integration.spec.ts` - End-to-end webhook flow
  - [x] `apps/agent/src/channels/TelegramAdapter.integration.spec.ts` - End-to-end webhook flow
  - [x] Verify RLS policies allow Agent to read/write channel tasks
  - [ ] Validate against a live Evolution API instance / sandbox

- [ ] 8) Production Deployment Checklist (AC: 1, 6)
  - [x] Document public webhook URLs for platform configuration
  - [ ] Verify HTTPS is enforced at the Hetzner edge/load balancer
  - [ ] Test webhook connectivity from Evolution API and Telegram in production-like environment
  - [ ] Verify secret/token rejection in production environment

## Dev Notes

### Architecture Patterns

- **Adapter Pattern**: Both WhatsApp and Telegram implement the `ChannelAdapter` interface for consistency. [Source: `apps/agent/src/channels/ChannelAdapter.ts`]
- **Webhook Security**: Platform-specific signature/token validation is implemented in each adapter's `validateWebhook` method.
- **Threading**: Platform chat ID is used as `thread_id` for conversation continuity.

### WhatsApp-Specific Implementation

- **Provider Strategy**: WhatsApp delivery supports Evolution API, Meta Cloud API, and Twilio, with `WHATSAPP_PROVIDER=auto` preferring Evolution when configured.
- **Webhook Security**: Evolution uses `x-evolution-webhook-secret`; Meta uses `x-whatsapp-signature`; Twilio uses `x-twilio-signature`.
- **Inbound Events**: Evolution `messages.upsert` is normalized for user-authored inbound commands; self-authored echoes are ignored.
- **Delivery Events**: Evolution, Meta, and Twilio delivery callbacks are mapped into task delivery state transitions.

### Telegram-Specific Implementation

- **Simple Bot API**: Direct HTTPS calls to `https://api.telegram.org/bot{token}/sendMessage`.
- **Update Types**: Supports `message`, `edited_message`, and `callback_query` for comprehensive threading.
- **No 24-Hour Restriction**: Can send messages anytime after user starts the bot.
- **Internal Retry Loop**: `sendOutbound` has built-in retry logic (max 3 attempts with exponential backoff).

### Security Considerations

- **Secret Management**: All tokens/secrets are environment variables, never hardcoded.
- **Signature Validation**: Timing-safe comparison used for all signature/token validation.
- **Payload Redaction**: Audit logging should redact PII (phone numbers, usernames).

### Existing Implementation Summary

The core webhook infrastructure is **already implemented**:

| Component | File | Status |
|-----------|------|--------|
| WhatsApp Webhook Route | `apps/agent/src/routes/webhooks/whatsapp.ts` | ✅ Complete |
| Telegram Webhook Route | `apps/agent/src/routes/webhooks/telegram.ts` | ✅ Complete |
| WhatsApp Adapter | `apps/agent/src/channels/WhatsAppAdapter.ts` | ✅ Complete |
| Telegram Adapter | `apps/agent/src/channels/TelegramAdapter.ts` | ✅ Complete |
| Channel Router | `apps/agent/src/services/channelRouter.ts` | ✅ Complete |
| Webhook Registration | `apps/agent/src/index.ts` (lines 48-49) | ✅ Complete |

### Remaining Work

This story focuses on **alignment** activities:

1. **Configuration Documentation**: Ensure `.env.example` and README have complete setup instructions
2. **Integration Testing**: Add comprehensive integration tests for both platforms
3. **Production Deployment**: Verify webhook connectivity and SSL in production

### Project Structure Notes

- **Webhook Routes**: `apps/agent/src/routes/webhooks/` directory
- **Adapters**: `apps/agent/src/channels/` directory
- **Config**: `apps/agent/src/config/index.ts` (verify env var validation)
- **Shared Types**: `packages/shared/src/schemas.ts` (ChannelMessage schema)

### References

- Story 6.6 (Telegram Bidirectional Proxy): [Source: `_bmad-output/implementation-artifacts/6-6-telegram-bidirectional-proxy-execution.md`]
- Story 6.7 (WhatsApp Bidirectional Proxy): [Source: `_bmad-output/implementation-artifacts/6-7-whatsapp-bidirectional-proxy-execution.md`]
- Story 2.9 (Multi-Channel Foundation): [Source: `_bmad-output/implementation-artifacts/2-9-multi-channel-messaging-adapter-routing-delivery-state.md`]
- Architecture API Patterns: [Source: `_bmad-output/planning-artifacts/architecture.md#API & Communication Patterns`]
- PRD Messaging Requirements: [Source: `_bmad-output/planning-artifacts/prd.md#2. Messaging-First Proxy Agency`]
- WhatsApp Adapter: [Source: `apps/agent/src/channels/WhatsAppAdapter.ts`]
- Telegram Adapter: [Source: `apps/agent/src/channels/TelegramAdapter.ts`]
- WhatsApp Webhook Route: [Source: `apps/agent/src/routes/webhooks/whatsapp.ts`]
- Telegram Webhook Route: [Source: `apps/agent/src/routes/webhooks/telegram.ts`]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

### Completion Notes List

- Verified existing webhook implementation is complete for both WhatsApp and Telegram
- Adapters implement full `ChannelAdapter` interface with validation, normalization, and send
- Webhook routes registered in `apps/agent/src/index.ts` at lines 48-49
- Remaining work: documentation, integration tests, and production deployment verification
- Re-aligned WhatsApp support to make Evolution API the preferred current option without removing Meta Cloud API or Twilio support, using Context7 API reference and Octocode verification against the official `EvolutionAPI/evolution-api` repository
- Added webhook setup guide to `README.md` with Evolution API, Meta, Twilio, and Telegram setup URLs
- Added doc-guard tests in `apps/agent/src/routes/webhooks/webhookSetupDocs.spec.ts` to validate required `.env.example` keys and README webhook setup links
- Added WhatsApp and Telegram webhook route-to-router integration coverage in adapter integration specs, including Evolution secret-token WhatsApp requests
- Added `apps/agent/src/channels/channelRlsPolicies.integration.spec.ts` to verify tasks/audit-log RLS policies required for channel task persistence
- Added production webhook deployment checklist to `README.md` covering public URLs, HTTPS enforcement, platform connectivity validation, and signature/token rejection checks
- Manual validation against a live Evolution API instance and production edge remains pending

### File List

- `_bmad-output/implementation-artifacts/7-1-messaging-channel-webhooks-alignment.md`
- `apps/agent/src/config/index.ts`
- `apps/agent/src/routes/webhooks/whatsapp.ts`
- `apps/agent/src/routes/webhooks/whatsapp.spec.ts`
- `apps/agent/src/routes/webhooks/telegram.ts`
- `apps/agent/src/channels/WhatsAppAdapter.ts`
- `apps/agent/src/channels/WhatsAppAdapter.spec.ts`
- `apps/agent/src/channels/TelegramAdapter.ts`
- `apps/agent/src/channels/ChannelAdapter.ts`
- `apps/agent/src/channels/ChannelAdapterRegistry.ts`
- `apps/agent/src/services/channelRouter.ts`
- `apps/agent/src/services/channelRouter.spec.ts`
- `apps/agent/src/index.ts`
- `apps/agent/src/controller/graph.ts`
- `apps/agent/.env.example` (to verify/update)
- `README.md` (to update with webhook setup instructions)
- `apps/agent/src/routes/webhooks/webhookSetupDocs.spec.ts`
- `apps/agent/src/channels/WhatsAppAdapter.integration.spec.ts`
- `apps/agent/src/channels/TelegramAdapter.integration.spec.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/agent/src/channels/channelRlsPolicies.integration.spec.ts`

## Change Log

 - 2026-03-20: Completed AC6 alignment work by validating webhook environment documentation, adding route-to-router integration coverage for WhatsApp/Telegram, adding RLS policy guard tests, and documenting the production webhook deployment checklist.
 - 2026-03-20: Re-aligned WhatsApp delivery to Evolution API, updated webhook security/docs/tests, and marked manual live-instance + production validation as pending follow-up work.
