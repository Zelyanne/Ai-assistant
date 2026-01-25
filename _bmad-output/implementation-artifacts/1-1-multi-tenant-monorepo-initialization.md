# Story 1.1: Multi-tenant Monorepo Initialization

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Developer,
I want a unified monorepo structure with Vue 3, Node.js Agent, and Shared types,
so that I can build the system with end-to-end type safety and consistent patterns.

## Acceptance Criteria

1. **Monorepo Structure**: The project is initialized as a pnpm workspace with `apps/web` (Vue 3), `apps/agent` (Node.js), and `packages/shared` (TypeScript library).
2. **Shared Package**: `packages/shared` is correctly linked to both `apps/web` and `apps/agent` using the `workspace:*` protocol.
3. **Database Types**: Supabase database types are generated into `packages/shared/src/database.types.ts` and exported from the package.
4. **Type Safety**: The project is configured with a base `tsconfig.json` that ensures strict typing and consistent compilation across all workspaces.
5. **Starter Templates**: `apps/web` uses the Vite Vue-TS template; `apps/agent` is a basic Node.js + TypeScript service.

## Tasks / Subtasks

- [x] **Monorepo Initialization** (AC: 1)
  - [x] Initialize `pnpm-workspace.yaml` with `apps/*` and `packages/*`.
  - [x] Create `package.json` at root with workspace scripts (`dev`, `build`, `lint`).

- [x] **Apps & Packages Setup** (AC: 1, 5)
  - [x] Initialize `apps/agent` as a Node.js + TypeScript service.
  - [x] Ensure `apps/web` is a Vue 3 + Vite + TypeScript project.
  - [x] Ensure `packages/shared` is a TypeScript library.

- [x] **Shared Dependency Linking** (AC: 2)
  - [x] Link `@ai-assistant/shared` to `apps/web` using `workspace:*`.
  - [x] Link `@ai-assistant/shared` to `apps/agent` using `workspace:*`.

- [x] **Supabase Type Generation** (AC: 3)
  - [x] Generate Supabase types into `packages/shared/src/database.types.ts`.
  - [x] Export types from `packages/shared/src/index.ts`.

- [x] **Global Type Safety** (AC: 4)
  - [x] Create a base `tsconfig.json` at root.
  - [x] Extend root `tsconfig.json` in all workspaces.

## Dev Notes

### Technical Stack & Versions
- **Node.js**: 20+
- **Package Manager**: pnpm (Workspaces)
- **Frontend**: Vue 3 (Composition API) + Vite + TypeScript
- **UI**: PrimeVue v4 (Styled Mode) + Tailwind CSS 3.4+
- **Backend/BaaS**: Supabase (Auth, DB, Realtime)
- **Shared**: Zod for schema validation

### Architecture Compliance
- Use `snake_case` for database-derived types and `camelCase` for application code.
- Shared types MUST be imported from `@ai-assistant/shared`.
- All agent actions must be logged (prepare the `agent_activity_log` type in `shared`).

### Project Structure Notes
- `apps/web`: Source for the Executive Hub.
- `apps/agent`: Source for the Node.js Agent Controller (Hetzner deployment).
- `packages/shared`: Centralized source for types, schemas, and shared utilities.

### References
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1]
- [pnpm Workspaces Documentation](https://pnpm.io/workspaces)
- [Supabase CLI Type Generation](https://supabase.com/docs/guides/api/rest/generating-types)
- [PrimeVue v4 Installation](https://primevue.org/installation/)

## Dev Agent Record

### Agent Model Used

Amelia (Developer Agent)

### Debug Log References

- [2026-01-13] Initialized pnpm-workspace.yaml and root package.json.
- [2026-01-13] Created apps/agent and initialized with Node.js/TS.
- [2026-01-13] Configured apps/web with PrimeVue v4 and Tailwind CSS 3.4.
- [2026-01-13] Verified Supabase types in packages/shared.
- [2026-01-13] Established global type safety with root tsconfig.base.json.

### Completion Notes List

- Created `pnpm-workspace.yaml` with `apps/*` and `packages/*` workspaces.
- Created root `package.json` with workspace scripts (`dev`, `build`, `lint`).
- Initialized `apps/agent` as a Node.js service with `tsx` for development.
- Setup `apps/web` with PrimeVue v4 (Aura theme) and Tailwind CSS 3.4 integration.
- Verified and exported Supabase database types from `@ai-assistant/shared`.
- Configured monorepo-wide strict TypeScript settings.

### File List

- `pnpm-workspace.yaml`
- `package.json`
- `tsconfig.base.json`
- `apps/agent/package.json`
- `apps/agent/tsconfig.json`
- `apps/agent/src/index.ts`
- `apps/web/package.json`
- `apps/web/tsconfig.app.json`
- `apps/web/tailwind.config.ts`
- `apps/web/postcss.config.js`
- `apps/web/src/main.ts`
- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- `packages/shared/src/database.types.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/schemas.ts`

### Change Log

- [2026-01-13] Initialized monorepo structure and starter applications.
- [2026-01-14] Fixed `apps/web/tsconfig.app.json` to extend `tsconfig.base.json` (Code Review).
- [2026-01-14] Added `packages/shared/src/schemas.ts` to File List (Code Review).
- [2026-01-14] Added missing `tailwindcss-primeui` dependency to `apps/web/package.json` (Bugfix).
- [2026-01-14] Created `apps/web/src/services/supabase.ts` and `apps/agent/src/services/supabase.ts` to align with Architecture (Context7 Verification).
- [2026-01-14] Added `apps/web/src/vite-env.d.ts` to fix Vue type resolution (Context7 Verification).

