# Contributing

## Workflow

1. Create a feature branch from `main`.
2. Make focused changes with tests.
3. Run quality checks before opening a PR.

## Local Setup

```bash
pnpm install
cp apps/agent/.env.example apps/agent/.env
cp apps/web/.env.example apps/web/.env
```

## Quality Gates

Run these before push:

```bash
pnpm lint
pnpm build
pnpm -r test
```

## Commit and PR Guidance

- Keep commits scoped and descriptive.
- Reference the related story/issue when available.
- Include test evidence in the PR description.
- Call out schema or migration impact explicitly.

## Database Changes

- Add Supabase DDL changes under `supabase/migrations`.
- Keep migration names timestamped and descriptive.
- Add or update tests that validate new schema behavior.

## Security

- Do not commit secrets, tokens, or service-role credentials.
- Use `.env.example` placeholders only.
