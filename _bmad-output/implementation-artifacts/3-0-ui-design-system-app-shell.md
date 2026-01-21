# Story 3.0: UI Design System & App Shell Implementation

Status: done

## Story

As a Developer,
I want to set up the core UI framework, Design System, Application Shell, and foundational pages (Login & Home),
so that the application has a secure, consistent, and "Executive Calm" entry point and layout.

## Acceptance Criteria

1. [x] **Framework Setup:** Vue 3 (Composition API) + Vite + TypeScript initialized in `apps/web`.
2. [x] **PrimeVue Integration:** PrimeVue (Material 3 Theme) installed and configured as the primary UI library.
3. [x] **Tailwind CSS Integration:** Tailwind CSS configured to work seamlessly with PrimeVue components.
4. [x] **Executive Calm Theme:** A custom `ThemeProvider` (or equivalent PrimeVue configuration) implemented with the following palette:
    *   **Primary:** Indigo `#334155`
    *   **Background:** Soft Grey `#F1F5F9`
    *   **Surface:** Pure White `#FFFFFF`
    *   **Success:** Deep Teal `#059669`
    *   **Warning:** Muted Amber `#D97706`
    *   **Info:** Clear Blue `#2563EB`
5. [x] **Typography:** `Inter` font configured for Headings/Primary UI; `Roboto` for Technical Body/Logs.
6. [x] **Login Page:** A dedicated Login view (`Login.vue`) implementing the "Executive Calm" aesthetic, handling Supabase Auth.
7. [x] **Structured Hub Layout (Home):** A responsive application shell for authenticated users:
    *   **Persistent Sidebar:** Navigation (Dashboard, Settings), collapsible on mobile.
    *   **Header:** Persistent top bar with Branding and "Emergency Brake" placeholder.
    *   **Dashboard Stage (Home):** The main content area where the Morning Brief (Story 3.3) will eventually live, following the 8px grid.
8. [x] **Routing:** `vue-router` set up with:
    *   `/login`: Public route.
    *   `/`: Protected Dashboard route.
    *   `/settings`: Protected Settings route.
9. [x] **Type Safety:** Core layout and page components must use explicit TypeScript interfaces and import shared types from `packages/shared`.

## Tasks / Subtasks

- [x] **Project Bootstrapping & Routing** (AC: 1, 8)
  - [x] Initialize/Refactor `apps/web` structure.
  - [x] Configure `vue-router` with Public/Protected route guards.
- [x] **Design System Foundation** (AC: 2, 3, 4, 5)
  - [x] Install `@primevue/themes` and Tailwind CSS.
  - [x] Configure PrimeVue with the "Material 3" theme (Aura/Lara base).
  - [x] Implement the "Executive Calm" palette and 12px border radii.
- [x] **Foundational Views** (AC: 6, 7)
  - [x] Implement `Login.vue` with Supabase Auth integration.
  - [x] Implement `AppLayout.vue` as the authenticated shell.
  - [x] Implement `AppHeader.vue` and `AppSidebar.vue`.
  - [x] Implement `Dashboard.vue` and `Settings.vue` layout shells.
- [x] **Testing & Quality** (AC: 9)
  - [x] Verify auth redirect logic.
  - [x] Verify responsive layout on mobile/tablet/desktop.

## Dev Notes

- **Design Philosophy:** "Background Intelligence, Foreground Simplicity." Use negative space generously.
- **Login Experience:** The login should feel calm and secure, not busy.
- **Emergency Brake:** Ensure the Header has a dedicated, high-visibility slot for the "Emergency Brake" toggle (FR11).
- **Type Safety:** All shared types must be imported from `packages/shared`.

### Project Structure Notes

- `src/components/layout/`: `AppLayout.vue`, `AppHeader.vue`, `AppSidebar.vue`.
- `src/views/`: `Login.vue`, `Dashboard.vue`, `Settings.vue`.
- `src/router/index.ts`: Updated auth guards.

### References

- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Design-System-Foundation]
- [Source: _bmad-output/planning-artifacts/architecture.md#Starter-Template-Evaluation]
- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.0]

## Dev Agent Record

### Agent Model Used

Antigravity (CS Workflow)

### Implementation Plan
- Step 1: Update Tailwind config with Executive Calm palette.
- Step 2: Implement PrimeVue custom preset in `main.ts`.
- Step 3: Create layout components (`AppLayout`, `AppHeader`, `AppSidebar`).
- Step 4: Implement `Login.vue` and `Settings.vue`.
- Step 5: Configure `vue-router` with auth guards.
- Step 6: Refactor `App.vue` and `Dashboard.vue` to use the new shell.
- Step 7: Verify with unit tests where applicable.

### Adversarial Review Fixes (Amelia)
- Fixed mobile navigation by implementing a drawer in `AppLayout` and toggle in `AppHeader`.
- Configured `Inter` and `Roboto` fonts in Tailwind and applied them to views.
- Corrected semantic mapping of PrimeVue tokens (`success`, `warning`, `info`).
- Upgraded "Emergency Brake" to a functional button component.
- Applied consistent semantic Tailwind tokens throughout the layout.
- Ensured type safety by using shared types in Pinia and components.

### Completion Notes List

- Successfully initialized the "Executive Calm" design system using PrimeVue 4 and Tailwind 3.
- Implemented a secure, responsive application shell with persistent navigation and emergency brake slot.
- Set up robust authentication routing using Supabase.
- Configured Inter and Roboto fonts for professional typography.
- Verified permission logic with Vitest.

### File List

- `apps/web/src/views/Login.vue`
- `apps/web/src/views/Dashboard.vue`
- `apps/web/src/views/Settings.vue`
- `apps/web/src/components/layout/AppLayout.vue`
- `apps/web/src/components/layout/AppHeader.vue`
- `apps/web/src/components/layout/AppSidebar.vue`
- `apps/web/src/router/index.ts`
- `apps/web/src/router/index.spec.ts`
- `apps/web/src/composables/usePermissions.spec.ts`
- `apps/web/tailwind.config.ts`
- `apps/web/src/main.ts`
- `apps/web/src/App.vue`
- `apps/web/src/style.css`
- `apps/web/index.html`

- `apps/web/src/views/Login.vue`
- `apps/web/src/views/Dashboard.vue`
- `apps/web/src/components/layout/AppLayout.vue`
- `apps/web/src/components/layout/AppHeader.vue`
- `apps/web/src/components/layout/AppSidebar.vue`
- `apps/web/src/router/index.ts`
- `apps/web/tailwind.config.ts`
- `apps/web/src/main.ts`
