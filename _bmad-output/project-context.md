---
project_name: 'Ai assistant'
user_name: 'Alexis'
date: '2026-01-12'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns']
status: 'complete'
rule_count: 31
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- **Frontend:** Vue 3 (Composition API) + TypeScript + Vite
- **UI Framework:** PrimeVue (Material 3 Theme) + Tailwind CSS
- **Backend/BaaS:** Supabase (Auth, PostgreSQL, RLS, Realtime)
- **Agent Controller:** Node.js + TypeScript (Hetzner Cloud)
- **Agent Protocol:** MCP SDK + Google Workspace MCP Server
- **State Management:** Pinia
- **Testing:** Vitest, Playwright
- **Package Management:** Pnpm Workspaces (Monorepo)

## Critical Implementation Rules

- **Database Naming:** Strict `snake_case` for tables, columns, and RLS policies.
- **TypeScript Naming:** `camelCase` for variables and functions; `PascalCase` for types/interfaces.
- **Data Interfaces:** Interfaces representing Supabase records MUST match the DB `snake_case`.
- **Agent Pattern:** "Database-as-Queue" – Frontend writes to `tasks`, Agent listens via Realtime.
- **Audit Requirement:** All agent actions must be logged to the immutable `agent_activity_log` table.
- **Security Perimeter:** The Agent Controller must check `PerimeterGuard.ts` before any LLM call.
- **Type Safety:** Shared types must be imported from `packages/shared`.

### Language-Specific Rules

- **Strict Typing:** No `any` types allowed. Use `unknown` if the type is truly dynamic and narrow it later.
- **Explicit Returns:** All functions and methods must have explicit return types.
- **Async/Await:** Prefer `async/await` over raw Promises for better readability.
- **Imports:** Use named imports instead of default imports where possible to improve tree-shaking and discoverability.

### Framework-Specific Rules

- **Vue 3 Composition API:** Use `<script setup>` syntax for all components to ensure consistency and conciseness.
- **State Management (Pinia):** Use Pinia stores for global or shared state; prefer localized state for component-specific logic.
- **UI Consistency (PrimeVue):** Always use PrimeVue components for UI elements (Buttons, Inputs, Dialogs) to ensure the Material 3 theme is applied correctly.
- **Supabase RLS:** All database interactions must respect Row Level Security. Never bypass RLS in the frontend.
- **Resource Cleanup:** All Supabase Realtime subscriptions must be explicitly unsubscribed in the `onUnmounted` hook to prevent memory leaks.

### Testing Rules

- **Unit Testing (Vitest):** Every utility function and Pinia store must have a corresponding `.spec.ts` file. Focus on testing logic isolation.
- **E2E Testing (Playwright):** Critical user paths (Login, Task Creation, Agent Interaction) must be covered by Playwright tests.
- **Component Testing:** Use Vitest with `@vue/test-utils` for testing complex component interactions.
- **Mocking:** Always mock external API calls (including Supabase) in unit tests to ensure they are fast and deterministic.
- **Snapshot Testing:** Use snapshots for PrimeVue component configurations to catch accidental UI changes.

### Code Quality & Style Rules

- **Linting & Formatting:** Adhere strictly to the Prettier and ESLint configurations. Run `pnpm lint` before every commit.
- **Naming Conventions:**
  - Components: `PascalCase.vue`
  - Composables: `useCamelCase.ts`
  - Constants: `SCREAMING_SNAKE_CASE`
- **File Structure:**
  - `src/components/`: Reusable UI components.
  - `src/composables/`: Shared logic.
  - `src/views/`: Page-level components.
- **Comment Styles:** Use JSDoc for complex functions and classes. Focus on explaining the "Why" for non-obvious logic.
- **Dependency Management:** Only add new dependencies after discussing with the team. Prefer internal helpers or PrimeVue utilities over small third-party libraries.

### Development Workflow Rules

- **Branch Naming:**
  - `feature/short-description`: For new features.
  - `fix/short-description`: For bug fixes.
  - `refactor/short-description`: For code refactoring.
- **Commit Messages:** Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification (e.g., `feat: add task list component`).
- **Documentation Checks:** Agents SHOULD proactively use the `context7` MCP tool to verify library APIs and best practices, especially when working with core project technologies.
- **Pull Requests:** Every PR must include a summary of changes, updated tests, and a link to the relevant Story or Epic.
- **Continuous Integration:** PRs cannot be merged unless all CI checks (linting, tests, build) pass.
- **Deployment:** Deployments to production are automated via GitHub Actions upon merging to the `main` branch.

### Critical Don't-Miss Rules

- **Anti-Patterns:**
  - **Direct DOM Manipulation:** Never use `document.querySelector` or similar; use Vue `ref` instead.
  - **Logic in Templates:** Keep templates clean; move complex expressions to `computed` properties.
- **Edge Cases:**
  - **Empty States:** Always handle empty data states in the UI (e.g., "No tasks found").
  - **Loading States:** Provide visual feedback (spinners/skeletons) during asynchronous operations.
- **Security:**
  - **API Keys:** Never hardcode secrets; use environment variables and ensure they are not exposed in the client build.
- **Performance:**
  - **Deep Watchers:** Avoid using `watch` with `deep: true` unless absolutely necessary; it can lead to performance degradation.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

Last Updated: 2026-01-12
