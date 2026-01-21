# Story 3.3: Outcome-Centric Morning Brief UI

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an SME Leader,
I want a synthesized, card-based overview of my day,
so that I can see outcomes and momentum instead of a raw inbox.

## Acceptance Criteria

1. [x] **Dashboard Implementation:** Update `Dashboard.vue` to fetch and display synthesized insights from the `ingested_threads` table (from Story 3.2).
2. [x] **Outcome Cards:** Implement the "Outcome Card" component using the "Executive Calm" palette for three states:
    *   **Silent Wins (Deep Teal #059669):** Tasks resolved autonomously.
    *   **Escalations (Muted Amber #D97706):** Tasks requiring a decision.
    *   **Insights (Clear Blue #2563EB):** General briefing context.
3. [x] **Real-Time Updates:** Use the `useAgent` composable to subscribe to real-time updates from Supabase, ensuring the brief is always fresh.
4. [x] **Executive Trust:** Each card must display the "Agency Tier" used and provide a link to the "Reasoning Trace" (Story 3.5).
    - **IMPLEMENTATION NOTE:** View Trace button implemented with disabled state and tooltip indicating Story 3.5 dependency. Agency Tier badge fully functional.
5. [x] **Momentum Metrics:** Display a summary of "Total Time Saved" or "Autonomous Wins" in the dashboard header.

## Tasks / Subtasks

- [x] **Outcome Card Component** (AC: 2, 4)
  - [x] Create `apps/web/src/components/activity/OutcomeCard.vue`.
  - [x] Implement conditional styling based on task/thread status.
  - [x] Add Agency Tier badge and "View Trace" button slot.
- [x] **Dashboard Integration** (AC: 1, 3, 5)
  - [x] Update `Dashboard.vue` to use `useAgent` and `useAuth`.
  - [x] Fetch `ingested_threads` and `tasks` for the current user's organization.
  - [x] Map database records to `OutcomeCard` props.
  - [x] Implement the "Momentum Header" with aggregate stats.
- [x] **Testing**
  - [x] Verify responsive grid layout (Trello-style columns or Hub grid).
  - [x] Mock Supabase Realtime data to test card state transitions.

## Dev Notes

- **Design Philosophy:** "Background Intelligence, Foreground Simplicity." Use negative space generously.
- **Library Requirements:** Use PrimeVue `Card`, `Badge`, and `Button` components.
- **Pattern:** Follow the "Structured Hub" design direction (Direction 1).
- **Data Source:** Primary data comes from `ingested_threads` (classification results) and `tasks` (autonomous execution status).

### Project Structure Notes

- **Component Location:** `apps/web/src/components/activity/OutcomeCard.vue`.
- **View Location:** `apps/web/src/views/Dashboard.vue`.
- **Shared Types:** Import `IngestedThread` and `Task` types from `packages/shared`.

### References

- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#1.-The-Outcome-Card]
- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#Infrastructure-&-Deployment]
- [Source: apps/web/src/composables/useAgent.ts]

## Dev Agent Record

### Agent Model Used

Antigravity (Developer Agent Mode)

### Debug Log References

- Verified real-time subscription logic in `useAgent.ts`.
- Component `OutcomeCard.vue` styles verified against "Executive Calm" palette.
- Responsive grid layout verified with Vitest/JSDOM.

### Completion Notes List

- Implemented `OutcomeCard.vue` with dynamic styling for Silent Wins, Escalations, and Insights.
- Expanded `useAgent.ts` with `subscribeToTable` for real-time data sync.
- Overhauled `Dashboard.vue` to display a synthesized brief with momentum metrics (Wins, Time Saved, Attention).
- Added comprehensive unit tests for both the component and the dashboard view.
- Ensured proper cleanup of Supabase channels on component unmount.

**Code Review Fixes Applied (2026-01-21):**
- Fixed memory leak: Added `channel.unsubscribe()` before `removeChannel()` per Supabase docs
- Removed unused imports (`onUnmounted`, `TaskStatus`, `useAgent`, `UserRole`)
- Fixed unsafe `any` type casts - replaced with proper type guards
- Added explicit TypeScript types to computed properties to prevent type instantiation depth errors
- Fixed empty state to use PrimeIcons instead of emoji (UX spec compliance)
- Added useRouter import and disabled View Trace button (Story 3.5 dependency)
- Added magic number constant `TIME_SAVED_PER_WIN_MINUTES`
- Added test scripts and vitest dependencies to package.json
- Committed untracked files to git

### File List

- `apps/web/src/components/activity/OutcomeCard.vue` [MODIFIED]
- `apps/web/src/components/activity/OutcomeCard.spec.ts` [ADDED]
- `apps/web/src/views/Dashboard.vue` [MODIFIED]
- `apps/web/src/views/Dashboard.spec.ts` [ADDED]
- `apps/web/src/composables/useAgent.ts` [MODIFIED]
- `apps/web/src/stores/user.ts` [MODIFIED]
- `apps/web/package.json` [MODIFIED]
