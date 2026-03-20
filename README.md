# AI Assistant Monorepo

Multi-tenant AI assistant platform with a Vue web app, a TypeScript agent service, shared schema/types, and Supabase migrations.

## Repository Layout

```text
apps/
  agent/   # Backend worker + API + LangGraph orchestration
  web/     # Vue dashboard and operator workflows
packages/
  shared/  # Shared schemas, types, and utilities
supabase/
  migrations/  # Database schema and policy migrations
```

## Prerequisites

- Node.js 20+
- pnpm 10+

## Quick Start

```bash
pnpm install
cp apps/agent/.env.example apps/agent/.env
cp apps/web/.env.example apps/web/.env
pnpm dev
```

This starts the workspace apps under `apps/*`.

## WhatsApp and Telegram Webhook Setup

The agent service exposes these public webhook endpoints:

- `https://<your-domain>/webhooks/whatsapp`
- `https://<your-domain>/webhooks/telegram`

Required agent environment variables are documented in `apps/agent/.env.example`, including:

- `WHATSAPP_PROVIDER` (`auto`, `evolution`, `meta`, or `twilio`)
- `EVOLUTION_API_BASE_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_INSTANCE_NAME`
- `EVOLUTION_WEBHOOK_SECRET`
- `WHATSAPP_API_KEY`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_WEBHOOK_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_PHONE_NUMBER`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`

Set `WHATSAPP_PROVIDER=auto` to prefer Evolution when configured and fall back to Meta or Twilio, or set it explicitly to `evolution`, `meta`, or `twilio`.

### Evolution API

1. Review the official Evolution API docs: `https://doc.evolution-api.com` and upstream repo: `https://github.com/EvolutionAPI/evolution-api`.
2. Configure your instance send credentials with `EVOLUTION_API_BASE_URL`, `EVOLUTION_API_KEY`, and `EVOLUTION_INSTANCE_NAME`.
3. Register the webhook with `POST /webhook/set/{instance}` and point it to your `/webhooks/whatsapp` endpoint.
4. In the Evolution webhook config, add header `x-evolution-webhook-secret: <EVOLUTION_WEBHOOK_SECRET>`.
5. Subscribe at minimum to `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, and `SEND_MESSAGE` so inbound messages and delivery transitions reach the agent.

### Meta WhatsApp Cloud API

1. Open your app in Meta Developer Dashboard: `https://developers.facebook.com/apps/`.
2. Go to **WhatsApp > Configuration** and set the callback URL to your `/webhooks/whatsapp` endpoint.
3. Set the Verify Token to the same value used in `WHATSAPP_WEBHOOK_SECRET`.
4. Subscribe to message and status webhook events for your app.
5. Meta POST callbacks are validated with `x-whatsapp-signature`.

### Twilio WhatsApp

1. Review the Twilio WhatsApp setup docs: `https://www.twilio.com/docs/whatsapp`.
2. Configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_WHATSAPP_PHONE_NUMBER`.
3. Point your Twilio webhook to `/webhooks/whatsapp`.
4. Twilio POST callbacks are validated with `x-twilio-signature`.

### Telegram BotFather + Bot API

1. Create or manage your bot with BotFather: `https://t.me/BotFather`
2. Set your webhook via Telegram Bot API: `https://core.telegram.org/bots/api#setwebhook`
3. Use your `/webhooks/telegram` endpoint and pass `secret_token` matching `TELEGRAM_WEBHOOK_SECRET`.

### Production Deployment Checklist

- [ ] **Document public webhook URLs**
  - WhatsApp: `https://<your-domain>/webhooks/whatsapp`
  - Telegram: `https://<your-domain>/webhooks/telegram`
- [ ] **Verify HTTPS enforcement at edge/load balancer**
  - Confirm HTTP requests redirect to HTTPS before reaching the app.
  - Confirm `x-forwarded-proto=https` is preserved to the agent service.
- [ ] **Test webhook connectivity from platform tools**
  - Evolution `POST /webhook/set/{instance}` should accept the callback URL and subscribed events.
  - Telegram `setWebhook` + `getWebhookInfo` should show successful delivery to your endpoint.
- [ ] **Verify signature/token rejection in production**
  - Evolution callbacks with invalid `x-evolution-webhook-secret` must return HTTP 401.
  - Meta callbacks with invalid `x-whatsapp-signature` must return HTTP 401.
  - Twilio callbacks with invalid `x-twilio-signature` must return HTTP 401.
  - Telegram with invalid `x-telegram-bot-api-secret-token` must return HTTP 401.

## Workspace Commands

- `pnpm dev` - Run app dev servers
- `pnpm build` - Build all workspace packages
- `pnpm lint` - Lint all workspaces
- `pnpm -r test` - Run tests in all workspaces that define `test`

## Architecture and Operations

- Architecture overview: `docs/ARCHITECTURE.md`
- Contribution guide: `CONTRIBUTING.md`
- Agent service details: `apps/agent/README.md`
- Web app details: `apps/web/README.md`

## Security Notes

- Never commit real secrets to `.env*` files.
- Rotate any credential that has ever been committed, even in private history.
