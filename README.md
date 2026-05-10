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

## Docker Deployment

The root `Dockerfile` builds two production targets:

- `agent` - Node.js backend worker/API on port `3001`
- `web` - Nginx-served Vue dashboard on port `80`

For a single-server launch with Docker Compose:

```bash
cp apps/agent/.env.example apps/agent/.env
cp apps/web/.env.example apps/web/.env
# Fill both env files with production values before starting.
docker compose --env-file apps/web/.env up --build -d
```

Default exposed ports:

- Web dashboard: `http://<server-ip>:8080`
- Agent API and webhooks: `http://<server-ip>:3001`

Set `VITE_AGENT_URL_PROJECT_GOOGLE_ASSITANT` in `apps/web/.env` to the public URL that browsers should use for the agent, for example `https://api.example.com` or `http://<server-ip>:3001`. Vite embeds this value at image build time, so rebuild the `web` image after changing it.

For reverse-proxy deployments, route these public paths to the agent service:

- `/api/*`
- `/webhooks/telegram`
- `/webhooks/whatsapp`

Health checks:

- Agent: `GET /health` on port `3001`
- Web: `GET /health` on port `8080`

## WhatsApp and Telegram Webhook Setup

The agent service exposes these public webhook endpoints:

- `https://<your-domain>/webhooks/whatsapp`
- `https://<your-domain>/webhooks/telegram`

Required agent environment variables are documented in `apps/agent/.env.example`, including:

- `WHATSAPP_PROVIDER_PROJECT_GOOGLE_ASSITANT` (`auto`, `evolution`, `meta`, or `twilio`)
- `EVOLUTION_API_BASE_URL_PROJECT_GOOGLE_ASSITANT`
- `EVOLUTION_API_KEY_PROJECT_GOOGLE_ASSITANT`
- `EVOLUTION_INSTANCE_NAME_PROJECT_GOOGLE_ASSITANT`
- `EVOLUTION_WEBHOOK_SECRET_PROJECT_GOOGLE_ASSITANT`
- `WHATSAPP_API_KEY_PROJECT_GOOGLE_ASSITANT`
- `WHATSAPP_PHONE_NUMBER_ID_PROJECT_GOOGLE_ASSITANT`
- `WHATSAPP_WEBHOOK_SECRET_PROJECT_GOOGLE_ASSITANT`
- `TWILIO_ACCOUNT_SID_PROJECT_GOOGLE_ASSITANT`
- `TWILIO_AUTH_TOKEN_PROJECT_GOOGLE_ASSITANT`
- `TWILIO_WHATSAPP_PHONE_NUMBER_PROJECT_GOOGLE_ASSITANT`
- `TELEGRAM_BOT_TOKEN_PROJECT_GOOGLE_ASSITANT`
- `TELEGRAM_BOT_USERNAME_PROJECT_GOOGLE_ASSITANT`
- `TELEGRAM_WEBHOOK_SECRET_PROJECT_GOOGLE_ASSITANT`
- `TELEGRAM_WEBHOOK_URL_PROJECT_GOOGLE_ASSITANT`

Set `WHATSAPP_PROVIDER_PROJECT_GOOGLE_ASSITANT=auto` to prefer Evolution when configured and fall back to Meta or Twilio, or set it explicitly to `evolution`, `meta`, or `twilio`.

### Evolution API

1. Review the official Evolution API docs: `https://doc.evolution-api.com` and upstream repo: `https://github.com/EvolutionAPI/evolution-api`.
2. Configure your instance send credentials with `EVOLUTION_API_BASE_URL_PROJECT_GOOGLE_ASSITANT`, `EVOLUTION_API_KEY_PROJECT_GOOGLE_ASSITANT`, and `EVOLUTION_INSTANCE_NAME_PROJECT_GOOGLE_ASSITANT`.
3. Register the webhook with `POST /webhook/set/{instance}` and point it to your `/webhooks/whatsapp` endpoint.
4. In the Evolution webhook config, add header `x-evolution-webhook-secret: <EVOLUTION_WEBHOOK_SECRET_PROJECT_GOOGLE_ASSITANT>`.
5. Subscribe at minimum to `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, and `SEND_MESSAGE` so inbound messages and delivery transitions reach the agent.

### Meta WhatsApp Cloud API

1. Open your app in Meta Developer Dashboard: `https://developers.facebook.com/apps/`.
2. Go to **WhatsApp > Configuration** and set the callback URL to your `/webhooks/whatsapp` endpoint.
3. Set the Verify Token to the same value used in `WHATSAPP_WEBHOOK_SECRET_PROJECT_GOOGLE_ASSITANT`.
4. Subscribe to message and status webhook events for your app.
5. Meta POST callbacks are validated with `x-whatsapp-signature`.

### Twilio WhatsApp

1. Review the Twilio WhatsApp setup docs: `https://www.twilio.com/docs/whatsapp`.
2. Configure `TWILIO_ACCOUNT_SID_PROJECT_GOOGLE_ASSITANT`, `TWILIO_AUTH_TOKEN_PROJECT_GOOGLE_ASSITANT`, and `TWILIO_WHATSAPP_PHONE_NUMBER_PROJECT_GOOGLE_ASSITANT`.
3. Point your Twilio webhook to `/webhooks/whatsapp`.
4. Twilio POST callbacks are validated with `x-twilio-signature`.

### Telegram BotFather + Bot API

1. Create or manage your bot with BotFather: `https://t.me/BotFather`
2. Set `TELEGRAM_WEBHOOK_URL_PROJECT_GOOGLE_ASSITANT` to your public HTTPS `/webhooks/telegram` endpoint so the agent can register the webhook before creating Telegram link tokens.
3. Or set your webhook manually via Telegram Bot API: `https://core.telegram.org/bots/api#setwebhook`
4. Use your `/webhooks/telegram` endpoint and pass `secret_token` matching `TELEGRAM_WEBHOOK_SECRET_PROJECT_GOOGLE_ASSITANT`.

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

## Cron Scheduler Configuration

The agent process includes a polling cron scheduler that evaluates `user_schedules` and enqueues due tasks.

- `CRON_POLL_INTERVAL_MS_PROJECT_GOOGLE_ASSITANT` - Polling interval in milliseconds (default `60000`)
- `DEFAULT_TIMEZONE_PROJECT_GOOGLE_ASSITANT` - Fallback timezone for schedule parsing when user timezone is missing (default `UTC`)
- `MAX_SCHEDULE_FAILURES_PROJECT_GOOGLE_ASSITANT` - Consecutive schedule execution failures before auto-disabling the schedule (default `3`)

Operational notes:

- The scheduler starts automatically with the agent service (`apps/agent/src/index.ts`).
- Due schedules create queued rows in `tasks` with `payload.schedule_id` for traceability.
- Dispatch idempotency is enforced through `user_schedule_dispatches`.
- Production monitoring and failure alert runbook: `apps/agent/README.md#schedule-cron-runbook`.

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
