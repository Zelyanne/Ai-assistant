# AI Assistant Web App

Vue 3 frontend for organization onboarding, task initiation, and operational dashboards.

## Local Development

```bash
pnpm --filter @ai-assistant/web dev
```

Useful commands:

- `pnpm --filter @ai-assistant/web build`
- `pnpm --filter @ai-assistant/web test`
- `pnpm --filter @ai-assistant/web lint`

## Environment

Create `apps/web/.env` from `apps/web/.env.example`.

Required values:

- `VITE_SUPABASE_URL_PROJECT_GOOGLE_ASSITANT`
- `VITE_SUPABASE_ANON_KEY_PROJECT_GOOGLE_ASSITANT`
- `VITE_AGENT_URL_PROJECT_GOOGLE_ASSITANT` (defaults to `http://localhost:3001`)
