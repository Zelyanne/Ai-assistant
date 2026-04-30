---
title: 'Gemini-style Command Center as Default + Full Landing Redesign'
slug: 'gemini-style-command-center-default-and-landing-redesign'
created: '2026-03-29'
status: 'completed'
stepsCompleted: [1, 2, 3, 4, 5]
tech_stack:
  - 'Vue 3 (Composition API) + TypeScript + Vite'
  - 'PrimeVue (Material 3 theme)'
  - 'Tailwind CSS'
  - 'Supabase (Postgres, RLS, Realtime)'
files_to_modify:
  - 'apps/web/src/router/index.ts'
  - 'apps/web/src/router/index.spec.ts'
  - 'apps/web/src/views/Login.vue'
  - 'apps/web/src/views/CommandCenter.vue'
  - 'apps/web/src/composables/useCommandCenter.ts'
  - 'apps/web/src/composables/useCommandCenter.spec.ts'
  - 'apps/web/src/components/command/CommandTimeline.vue'
  - 'apps/web/src/components/command/CommandComposer.vue'
  - 'apps/web/src/components/command/ConversationList.vue'
  - 'apps/web/src/components/layout/AppLayout.vue'
  - 'apps/web/src/components/layout/AppSidebar.vue'
  - 'apps/web/src/views/Landing.vue'
code_patterns:
  - 'Use <script setup> for Vue components'
  - 'Prefer PrimeVue components for UI (Button/Card/etc)'
  - 'No direct DOM manipulation; use Vue refs/computed'
  - 'Explicitly unsubscribe from Supabase Realtime on unmount'
test_patterns:
  - 'Vitest + @vue/test-utils for view/composable behavior'
  - 'Manual QA for layout/scroll/UX behaviors'
---

# Tech-Spec: Gemini-style Command Center as Default + Full Landing Redesign

**Created:** 2026-03-29

## Overview

### Problem Statement

After login, the app does not land users on the primary interaction surface (Command Center). The Command Center experience is not yet shaped like a modern “Gemini/ChatGPT” interface with a conversation history list and switchable threads. Additionally, the UI needs a polish pass for fluidity (layout ergonomics, transitions, sticky composer, auto-scroll, responsive refinements). The public landing page also needs a full redesign to feel modern and aligned with the desired “Gemini-like” aesthetic.

### Solution

1) Make Command Center the default post-login destination by routing authenticated entry to `/dashboard/command-center`.

2) Redesign Command Center into a Gemini-like layout:
- Left: conversation list (create + switch only)
- Center: chat thread/timeline + sticky composer
- Integrated “active orchestration” status display (reusing current run summary UI)

3) Load conversation history from Supabase (org/user scoped) and keep realtime updates consistent with existing command-center patterns.

4) Fully redesign `Landing.vue` to a more modern, minimal, high-contrast/soft-gradient Gemini-like look using PrimeVue + Tailwind (no new dependencies).

### Scope

**In Scope:**
- After-login default route shows Command Center.
- Command Center UI updated to include conversation history list + thread switching.
- Conversation history loaded from Supabase.
- UI “fluidity” improvements: transitions, sticky composer, auto-scroll behavior, responsive layout polish.
- Landing page full redesign.

**Out of Scope:**
- Conversation rename/delete/search/pin.
- Rewriting agent execution pipeline; must reuse existing DB-as-queue + safety controls.
- Introducing new UI libraries or dependencies.

## Context for Development

### Codebase Patterns

- Vue 3 Composition API with `<script setup>`.
- PrimeVue components for consistent Material 3 themed UI.
- Tailwind for layout/spacing/utility styling.
- Supabase as the data layer; RLS must remain authoritative.
- Realtime subscriptions must be unsubscribed on unmount.

#### Investigation Findings (Anchor Points)

- **Routing / default post-login destination**
  - `apps/web/src/views/Login.vue` currently redirects to `/dashboard` after password sign-in.
  - `apps/web/src/router/index.ts` redirects authenticated users away from `/login` to `{ name: 'dashboard' }` and also redirects away from onboarding to `{ name: 'dashboard' }`.
  - `apps/web/src/router/index.spec.ts` asserts the current behavior (authenticated -> dashboard). This will need to be updated when Command Center becomes the default.

- **Command Center surface (current state)**
  - `apps/web/src/views/CommandCenter.vue` renders:
    - Header + “Start New Discussion” action
    - Active orchestration summary card (derived from timeline execution run data)
    - `CommandTimeline` + `CommandComposer`
  - `apps/web/src/components/command/CommandTimeline.vue` currently:
    - Sorts messages by `createdAt`
    - Uses `max-h` scroll container (`max-h-[58vh]`) but has no auto-scroll or sticky composer behavior.
    - Does not animate insert/update transitions.
  - `apps/web/src/components/command/CommandComposer.vue` already supports Enter-to-submit + Shift+Enter newline and has an accessible label.

- **Conversation + message persistence (Supabase-backed already, but single-thread UX)**
  - Schema exists in migration: `supabase/migrations/20260309100000_create_command_center_conversations.sql`.
    - `command_messages` trigger updates `command_conversations.updated_at` so ordering by recency is straightforward.
  - `apps/web/src/composables/useCommandCenter.ts` already:
    - Creates/loads a conversation (`ensureConversationId()`), caches it in localStorage, and loads messages from Supabase (`loadConversationMessages`).
    - Subscribes in realtime to org-scoped `tasks`, `execution_runs`, and `command_messages` via `useAgent.subscribeToTable()`.
    - **Limitation:** there is no “conversation list + switch” capability; it always binds the UI to the most recent (or cached) conversation.
    - `startNewDiscussion()` creates a fresh conversation and resets timeline.
  - Realtime subscription mechanism (`apps/web/src/composables/useAgent.ts`) filters by `organization_id`, so any multi-conversation UX should:
    - Filter message events to the active conversation in callbacks (already done today), and
    - Add a light-weight path to keep the conversation list in sync (likely `command_conversations` subscription).

- **UI shell constraints**
  - `apps/web/src/components/layout/AppLayout.vue` wraps authenticated views with a persistent sidebar and a `fade` route transition. Main content is constrained (`max-w-6xl`) with `p-8/lg:p-12`.
  - If Command Center is made “Gemini-like”, we’ll likely need:
    - a taller, more immersive layout inside the content area (or adjust layout constraints on this route), and
    - a second column for conversation history within the Command Center view.

- **Landing page (public)**
  - `apps/web/src/views/Landing.vue` is already fairly polished (hero, feature cards, CTA), but the request is a full redesign.
  - Visual direction guidance from research:
    - Google Design’s Gemini illustration system emphasizes **directional gradients** (sharp leading edge diffusing at tail), **circle/rounded foundational shapes**, and **intentional motion** that communicates “thinking” without being noisy. (Source: https://design.google/library/gemini-ai-visual-design)

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/web/src/views/Login.vue` | Currently routes to `/dashboard` after sign-in |
| `apps/web/src/router/index.ts` | Auth guard redirects + `/dashboard` child routes |
| `apps/web/src/router/index.spec.ts` | Guard tests (will change when default route changes) |
| `apps/web/src/components/layout/AppLayout.vue` | Authenticated shell + route transition constraints |
| `apps/web/src/components/layout/AppSidebar.vue` | App-level navigation (separate from conversation history list) |
| `apps/web/src/views/CommandCenter.vue` | Current command center view composition |
| `apps/web/src/composables/useCommandCenter.ts` | Supabase-backed conversation/message loading + realtime subscriptions |
| `apps/web/src/components/command/CommandTimeline.vue` | Timeline UI + scroll container constraints |
| `apps/web/src/components/command/CommandComposer.vue` | Input ergonomics (Enter vs Shift+Enter) |
| `supabase/migrations/20260309100000_create_command_center_conversations.sql` | Conversations/messages tables + RLS + triggers + realtime publication |
| `packages/shared/src/schemas.ts` | Zod schemas for command conversation/message payloads |
| `apps/web/src/views/Landing.vue` | Public landing page to redesign |

### Technical Decisions

- Command Center should be the default authenticated landing surface.
- Conversation history must be loaded from Supabase (not local-only).
- Feature scope for history: create + switch only.
- Preserve existing safety controls and DB-as-queue contracts.
- Keep the global app navigation sidebar (`AppSidebar`) in place for overall navigation; implement the Gemini-like conversation history as an in-view panel inside `CommandCenter.vue`.
- Make the Command Center feel primary by (a) making it the default destination and (b) enabling a wider layout for the command center route via `AppLayout` route meta.

## Implementation Plan

### Tasks

- [x] Task 1: Make Command Center the default post-login route
  - File: `apps/web/src/views/Login.vue`
  - Action: After successful password sign-in, route to `/dashboard/command-center` instead of `/dashboard`.
  - Notes: Google OAuth flow likely returns via auth redirect; ensure post-login routing is still handled by router guards.

- [x] Task 2: Update auth guard redirects to point at Command Center by default
  - File: `apps/web/src/router/index.ts`
  - Action: Change guard behavior so authenticated users visiting `/login` are redirected to `{ name: 'command-center' }` (or `/dashboard/command-center`).
  - Action: Change “organization already exists” onboarding redirect target from `{ name: 'dashboard' }` to `{ name: 'command-center' }`.
  - Notes: Do NOT remove the Dashboard route; this change is only about default destinations.

- [x] Task 2.1: Make Command Center the first navigation item
  - File: `apps/web/src/components/layout/AppSidebar.vue`
  - Action: Reorder `navItems` so “Command Center” appears above “Dashboard”.
  - Notes: This reinforces “Command Center is the main interface” without removing any existing destinations.

- [x] Task 3: Update router guard tests for new default destination
  - File: `apps/web/src/router/index.spec.ts`
  - Action: Update assertions so “authenticated user -> login” redirect goes to `command-center` (not `dashboard`).
  - Action: Add a test ensuring `router.push('/dashboard')` still loads the existing dashboard view (unless explicitly changed in routing).

- [x] Task 4: Add Supabase-backed conversation history list (create + switch)
  - File: `apps/web/src/composables/useCommandCenter.ts`
  - Action: Introduce reactive state for:
    - `conversations: Array<{ id: string; title: string | null; updatedAt?: string; createdAt?: string }>`
    - `activeConversationId: string | null` (already exists as a ref but must become a first-class public API)
  - Action: Implement `loadConversations()` to query `command_conversations` scoped to current principal:
    - `.eq('organization_id', organizationId)`
    - `.eq('created_by', userId)`
    - `.eq('channel', 'web')`
    - `.order('updated_at', { ascending: false })`
  - Action: Implement `switchConversation(conversationId: string)`:
    - Stop message realtime subscription (and any per-conversation listeners)
    - Clear `timeline` and `messageIdByEntryId`
    - Set `activeConversationId`
    - Load messages for that conversation via `loadConversationMessages(conversationId)`
    - Reload execution runs for the timeline via `loadExecutionRunsForTimeline(organizationId)`
    - Restart realtime sync with callbacks filtering against the *current* `activeConversationId`
  - Action: Add a `command_conversations` realtime subscription to keep the list fresh (org-scoped via `subscribeToTable`).
  - Action: Expose new state + methods from the composable return value:
    - `conversations`, `activeConversationId`
    - `loadConversations()`, `switchConversation(conversationId)`
  - Notes:
    - Fix the current closure issue: message subscription callback must not capture a single `conversationId` forever; it must compare each incoming row against `activeConversationId.value`.
    - Keep localStorage caching as an optimization, but the canonical data source is Supabase.

- [x] Task 5: Update start-new-discussion behavior to align with multi-conversation UX
  - File: `apps/web/src/composables/useCommandCenter.ts`
  - Action: Keep “new chat” behavior but ensure it:
    - Creates a new `command_conversations` row
    - Updates `activeConversationId`
    - Refreshes conversation list ordering
    - Loads empty/default timeline and starts realtime sync on the new conversation
  - Notes: The public API can remain `startNewDiscussion()` (to avoid churn), but it must be internally consistent with switching.

- [x] Task 6: Build conversation list UI panel component
  - File: `apps/web/src/components/command/ConversationList.vue` (new)
  - Action: Implement a left-side panel that shows:
    - “New chat” button
    - Scrollable list of conversations (most recent first)
    - Selected state for active conversation
    - Empty state when no conversations exist yet
  - Notes:
    - Use PrimeVue components (e.g., `Button`) and Tailwind for layout.
    - Keep scope minimal: create + switch only (no rename/delete/search/pin).

- [x] Task 7: Redesign Command Center view into a Gemini-like layout (history + main thread)
  - File: `apps/web/src/views/CommandCenter.vue`
  - Action: Replace the current single-column layout with a responsive layout:
    - Left column: `ConversationList` (visible on md+; Drawer/overlay on mobile)
    - Center column: timeline + sticky composer (main surface)
    - Optional right/top: integrated “Active orchestration” status (reuse existing card)
  - Action: Wire UI to `useCommandCenter()` APIs:
    - load conversations
    - create new conversation
    - switch conversation
    - submit command
  - Action: On mount, ensure the conversation list is loaded and an active conversation is selected (localStorage ID if valid; otherwise most-recent; otherwise create a new conversation).
  - Notes:
    - Keep the command composer visually anchored (sticky) at the bottom of the center column.

- [x] Task 8: Improve message timeline fluidity (auto-scroll, transitions, ergonomics)
  - File: `apps/web/src/components/command/CommandTimeline.vue`
  - Action: Add “Gemini-like” polish:
    - Use `<TransitionGroup>` for message insert/update animations (subtle).
    - Add auto-scroll-to-bottom when new messages arrive **only if** the user is already near the bottom.
    - Add a “Jump to latest” affordance when the user is scrolled up and new messages arrive.
  - Notes:
    - Use Vue `ref` for the scroll container; do not use `document.querySelector`.
    - Define a near-bottom threshold (e.g., within 120px of the bottom) to decide whether to auto-scroll.

- [x] Task 9: Make composer placement and spacing feel like a modern chat surface
  - File: `apps/web/src/components/command/CommandComposer.vue`
  - Action: Support a “compact / chat” variant (props) for tighter, Gemini-like layout:
    - rounded container, subtle border, focus ring, and button alignment
    - optional helper text visibility toggle (keep accessibility)
  - Notes: Maintain current keyboard behavior and label association.

- [x] Task 10: Allow Command Center route to use a wider / more immersive layout
  - File: `apps/web/src/components/layout/AppLayout.vue`
  - Action: Use route meta to optionally widen content constraints:
    - For example, `meta: { layoutWidth: 'wide' }` for command-center route
    - Render `max-w-none` (and adjusted padding) for wide routes; keep default for other routes.
  - File: `apps/web/src/router/index.ts`
  - Action: Add the route meta flag for `command-center`.
  - Notes: This keeps the rest of the dashboard stable while letting Command Center feel like “the main interface”.

- [x] Task 11: Full redesign of the public landing page with Gemini-like visual language
  - File: `apps/web/src/views/Landing.vue`
  - Action: Replace layout and content with a new design that emphasizes:
    - Directional gradients (sharp leading edge -> diffused tail) and rounded containers
    - Calm typography and generous whitespace
    - Intentional motion (subtle hover/scroll cues; avoid noisy animations)
    - Clear CTA funnel to Login/Get Started
  - Action: Recommended section layout (single-page, no extra routes required):
    - Sticky top nav (brand + Login + Get Started)
    - Hero (headline, subhead, primary/secondary CTAs, lightweight product mock)
    - “How it works” (3-step horizontal / stacked on mobile)
    - Capabilities grid (4–6 cards)
    - Trust/safety block (perimeter + audit logging positioning)
    - Final CTA + footer
  - Notes:
    - Stay within PrimeVue + Tailwind; do not add dependencies.
    - Keep performance reasonable (no heavy background videos).

- [x] Task 12: Update unit tests for new conversation switching + default routing
  - File: `apps/web/src/composables/useCommandCenter.spec.ts`
  - Action: Add tests that cover:
    - Loading conversations list from `command_conversations`.
    - Switching conversation resets timeline and loads messages for the selected conversation.
    - Realtime callbacks only update the currently active conversation.
  - File: `apps/web/src/views/CommandCenter.spec.ts`
  - Action: Update stubs/assertions for the new layout and new conversation list interactions.

### Acceptance Criteria

- [x] AC 1: Given an authenticated user, when they complete login, then they are routed to `/dashboard/command-center` by default.

- [x] AC 2: Given an authenticated user visits `/login`, when a valid session exists, then they are redirected to the Command Center (not the Dashboard).

- [x] AC 3: Given an authenticated user with an organization, when they finish onboarding (or attempt to revisit onboarding), then they are redirected to the Command Center by default.

- [x] AC 4: Given an authenticated user opens Command Center, when the view mounts, then the conversation list is loaded from Supabase for their org and user principal.

- [x] AC 5: Given a user selects a conversation in the left history list, when they click it, then the center timeline shows that conversation’s messages loaded from Supabase in chronological order.

- [x] AC 6: Given a user clicks “New chat”, when conversation creation succeeds, then a new conversation becomes active and the timeline resets to the default welcome state.

- [x] AC 7: Given a user submits a message in the active conversation, when submission succeeds, then:
  - the user message is persisted to `command_messages`,
  - the assistant “intent preview” message is persisted,
  - and a `tasks` row is queued via the existing database-as-queue contract.

- [x] AC 8: Given realtime updates arrive (tasks/execution_runs/messages), when updates are received, then the UI updates without a page refresh and without leaking subscriptions when navigating away.

- [x] AC 9: Given a user is reading older messages (scrolled up), when new messages arrive, then the timeline does not forcibly scroll, and a “Jump to latest” affordance appears.

- [x] AC 10: Given a user is near the bottom of the conversation, when new messages arrive, then the timeline auto-scrolls to keep the latest message visible.

- [x] AC 11: Given the Command Center is viewed on mobile, when the user needs to switch conversations, then conversation history remains accessible via an overlay/drawer without breaking the main chat surface.

- [x] AC 12: Given a public user visits `/`, when they view the landing page, then it presents a fully redesigned modern landing experience aligned with the Gemini-like style direction and includes clear CTAs to Login/Get Started.

## Additional Context

### Dependencies

- Existing command-center schema + story foundations (see `_bmad-output/implementation-artifacts/6-1-natural-language-command-center.md`).
- Supabase tables and triggers:
  - `command_conversations` (ordering by `updated_at`)
  - `command_messages` (message stream + per-message `state`)
  - Trigger `touch_command_conversation_updated_at()` ensures conversation recency updates when messages change.
- Existing org-scoped realtime subscriptions via `useAgent.subscribeToTable()`.

### Testing Strategy

- Unit tests (Vitest):
  - Router guard tests: verify new redirect targets.
  - `useCommandCenter` tests: conversation list load, switch behavior, and realtime filtering by active conversation.
  - View tests: `CommandCenter.vue` renders the new layout and wires actions to the composable.

- Manual QA checklist:
  - Login via password: lands in Command Center.
  - Visit `/login` while authenticated: redirected to Command Center.
  - Create new chat: new conversation appears and becomes active.
  - Switch chats: messages swap correctly; realtime updates only affect the active chat.
  - Scroll behavior: auto-scroll works near bottom; “jump to latest” appears when scrolled up.
  - Mobile: conversation list is accessible (drawer/overlay) and composer remains usable.
  - Landing page: responsive, modern redesign, CTA routes to login.

### Notes

- Visual target: “Gemini-like” (clean, airy, gradient energy accents, rounded containers, strong typography, high polish).
- Design guidance source: Google Design Gemini illustration system emphasizes directional gradients, rounded foundational shapes, and intentional motion (https://design.google/library/gemini-ai-visual-design).
- Risk watch:
  - Realtime subscription callbacks must not capture stale conversation IDs; switching must re-bind cleanly and unsubscribe on unmount.
  - Avoid loading unbounded history if conversations become extremely large; consider adding a reasonable initial fetch limit if performance becomes an issue (without changing the create+switch scope).

## Review Notes

- Adversarial review completed
- Findings: 18 total, 10 fixed, 8 skipped
- Resolution approach: auto-fix
