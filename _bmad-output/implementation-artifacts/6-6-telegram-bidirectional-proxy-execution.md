# Story 6.6: Telegram Bidirectional Proxy Execution

Status: done

Story ID: 6.6
Story Key: 6-6-telegram-bidirectional-proxy-execution

## Story

As an SME Leader,
I want the assistant to support direct, persistent, multi-turn conversation on Telegram,
including execution of authorized Google Workspace tasks from that conversation context,
so that I can delegate complex tasks as easily as sending a message and receive instant confirmations.

## Acceptance Criteria

1. **End-to-end Telegram Command Execution:**
   - **Given** a Telegram message sent by an authorized user to the bot
   - **When** the `TelegramAdapter` normalizes the inbound message and it is enqueued by the `ChannelRouterService`
   - **Then** the Agent Controller processes the message as a conversational command using the `AssistantCommandProcessor`
   - **And** authorized Google Workspace tasks (Email/Calendar) are executed based on the user's intent.

2. **Bidirectional Message Flow (Real outbound delivery):**
   - **Given** the Agent needs to respond to a user or confirm an action
   - **When** an outbound task with `domain_action: 'channel.send'` is triggered for the Telegram channel
   - **Then** the `TelegramAdapter` utilizes the actual Telegram Bot API (via `node-telegram-bot-api` or direct HTTPS) to deliver the message.
   - **And** the delivery state is updated in the task result and audit log (Story 6.4).

3. **Full Proxy Authorization & Guardrails:**
   - **Given** an incoming command from Telegram
   - **When** evaluated by the `PerimeterGuard`
   - **Then** the current `AgencyTier` and `UserProtocol` are strictly enforced.
   - **And** "Restricted" topics are escalated to the Hub with a reasoning trace.

4. **Contextual Threading and Multi-turn:**
   - **Given** a multi-turn conversation on Telegram
   - **When** the Agent responds or processes a follow-up message
   - **Then** it maintains the `thread_id` (Telegram chat ID) and `correlation_id` correctly to ensure a coherent conversational context.

5. **Security and Secret Validation:**
   - **Given** an incoming webhook from Telegram
   - **When** validated by the `TelegramAdapter`
   - **Then** the `x-telegram-bot-api-secret-token` header is verified against the configured secret.

6. **Tests cover API integration and security:**
   - **Given** this story is implemented
   - **When** integration tests run
   - **Then** they verify end-to-end task execution from Telegram and correct outbound delivery.

## Tasks / Subtasks

- [x] 1) Implement Telegram API Integration in `TelegramAdapter.ts` (AC: 2, 5)
  - [x] Configure `TELEGRAM_BOT_TOKEN` in `apps/agent/.env`.
  - [x] Replace mock `sendOutbound` with actual Telegram Bot API call (`sendMessage`).
  - [x] Implement robust error handling for Telegram API responses (e.g., chat not found, blocked by user).
  - [x] Ensure `validateWebhook` correctly uses the configured secret token.

- [x] 2) Enhance `TelegramAdapter` Normalization (AC: 4)
  - [x] Ensure `normalizeInbound` correctly maps Telegram `chat.id` to `thread_id`.
  - [x] Capture additional Telegram metadata (username, first_name) for better personalization.

- [x] 3) Integrate with `AssistantCommandProcessor` (AC: 1)
  - [x] Ensure Telegram-sourced messages are routed to `AssistantCommandProcessor` with correct context.
  - [x] Verify that the processor can resolve intent and create follow-up tasks (e.g., `email.send`) that eventually result in a Telegram confirmation.

- [x] 4) Implement Outbound Dispatcher support (AC: 2)
  - [x] Ensure the `ChannelRouterService` correctly dispatches `channel.send` tasks to the `TelegramAdapter`. [Source: `apps/agent/src/services/channelRouter.ts`]

- [x] 5) Audit Logging & Reasoning Trace (AC: 2, 4)
  - [x] Verify that Telegram actions are correctly logged in `agent_activity_log` using the patterns from Story 6.4.
  - [x] Ensure the "Reasoning Trace" shows the logic from Telegram command to Workspace execution.

- [x] 6) Integration Testing (AC: 6)
  - [x] Create `apps/agent/src/channels/TelegramAdapter.integration.spec.ts`.
  - [x] Mock Telegram API responses to test send/receive loops.
  - [x] Verify RLS policies allow the Agent to read/write Telegram-related tasks.

## Dev Notes

- **Library Choice**: Prefer direct HTTPS calls to Telegram Bot API or a lightweight wrapper to keep `apps/agent` lean.
- **Security**: Never log the `TELEGRAM_BOT_TOKEN`. Ensure `PerimeterGuard` redacts any PII before it reaches the Telegram servers if required by the organization's policy.
- **Threading**: Telegram `chat_id` is the primary `thread_id`. Use this to group all messages in a conversation. [Source: `apps/agent/src/channels/TelegramAdapter.ts`]
- **Retry Policy**: Use the existing `retryPolicy.ts` for handling transient Telegram API failures (e.g., 429 Too Many Requests).

### Project Structure Notes

- **Backend**: `apps/agent/src/channels/TelegramAdapter.ts`, `apps/agent/src/routes/webhooks/telegram.ts`.
- **Infrastructure**: Update `apps/agent/src/config/index.ts` to include Telegram configuration.

### References

- Sprint Change Proposal 2026-03-05: [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-03-05.md`]
- Architecture Multi-Channel Adapter: [Source: `_bmad-output/planning-artifacts/architecture.md#API & Communication Patterns`]
- Story 2.9 (Backend foundation): [Source: `_bmad-output/implementation-artifacts/sprint-status.yaml`]

## Dev Agent Record

### Agent Model Used

antigravity-gemini-3-flash

### Debug Log References

### Completion Notes List

- Implemented real Telegram Bot API integration using `fetch`.
- Updated `TelegramAdapter` to handle `bot_token` and robust error handling.
- Enhanced `normalizeInbound` to capture `first_name`, `last_name`, and support `edited_message` and `callback_query` for robust `thread_id` mapping.
- Configured `ChannelRouterService` to route all Telegram inbound messages (non-relancing) to `assistant.command`.
- Updated `AssistantCommandProcessor` to accept `message_text` as a command source.
- Registered `TELEGRAM_BOT_TOKEN` in `ChannelAdapterRegistry`.
- Updated `graph.ts` to include `channel.send` and `assistant.command` in authorized proxy actions.
- Added comprehensive unit and integration tests.
- Fixed code review findings: Improved Telegram update normalization and added missing file to File List. (Note: Retry logic is verified as implemented in `ChannelSendProcessor` which orchestrates the adapter).

### File List

- `_bmad-output/implementation-artifacts/6-6-telegram-bidirectional-proxy-execution.md`
- `apps/agent/src/config/index.ts`
- `apps/agent/.env.example`
- `apps/agent/src/channels/TelegramAdapter.ts`
- `apps/agent/src/channels/TelegramAdapter.spec.ts`
- `apps/agent/src/channels/ChannelAdapterRegistry.ts`
- `packages/shared/src/schemas.ts`
- `apps/agent/src/processors/AssistantCommandProcessor.ts`
- `apps/agent/src/services/channelRouter.ts`
- `apps/agent/src/services/channelRouter.spec.ts`
- `apps/agent/src/processors/AssistantCommandProcessor.spec.ts`
- `apps/agent/src/channels/TelegramAdapter.integration.spec.ts`
- `apps/agent/src/controller/graph.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
