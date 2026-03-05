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
