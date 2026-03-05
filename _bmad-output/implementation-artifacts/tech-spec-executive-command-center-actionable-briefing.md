---
title: 'Executive Command Center & Actionable Briefing'
slug: 'executive-command-center-actionable-briefing'
created: '2026-02-10T11:45:00.000Z'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Vue 3', 'Tailwind CSS', 'PrimeVue', 'Supabase', 'Vitest']
files_to_modify: ['apps/web/src/views/Dashboard.vue', 'apps/web/src/components/activity/OutcomeCard.vue', 'apps/web/src/style.css']
code_patterns: ['PrimeVue Components', 'Tailwind Utility Styles', 'Vue 3 Composition API', 'Computed Dashboard Filtering']
test_patterns: ['Vitest Component Testing']
---

# Tech-Spec: Executive Command Center & Actionable Briefing

**Created:** 2026-02-10T11:45:00.000Z

## Overview

### Problem Statement

The current Morning Brief is visually unappealing, presenting information as a dense block of text without clear hierarchy. Additionally, "Outcome Cards" lack direct actionable triggers, making it difficult for the user to quickly automate or handle tasks directly from the dashboard.

### Solution

Redesign the briefing experience by introducing an "Executive Command Center" layout. This includes:
1.  **Executive Highlights Bar**: A high-level dashboard within the brief showing "Wins", "Blockers", and "Risks" as visual pills. These pills act as **interactive filters** for the cards below.
2.  **Stylized Narrative (Executive Prose)**: 
    - Use a custom `.executive-prose` Tailwind class for enhanced typography (WSJ-style).
    - Implement a "Regex Stylizer" to wrap `[SOURCE_ID]` in styled pills.
    - Use **Callout Boxes** for high-priority narrative segments.
    - Lead with a **Bottom Line Up Front (BLUF)** box for instant impact.
3.  **Actionable Outcome Cards & Selection UX**:
    - Add **Checkboxes** to `OutcomeCard.vue` for multi-select.
    - Implement a **Global Action Bar** (Automate / Handle) that appears when 1+ items are selected.
    - **Handle It**: Open source context in a side-panel "Peek" view rather than a full page navigation.
    - **Automate**: Triggers background agent actions for the selected tasks with real-time feedback (Spinner -> Success State).

### Scope

**In Scope:**
- UI Redesign of the "Briefing" tab in `Dashboard.vue`.
- Enhancement of `OutcomeCard.vue` with action buttons and styling.
- Styling of the `summary_text` (Executive Rundown) with better visual structure.
- Implementation of button handlers (Automate/Handle) in the Dashboard.
- Side-panel "Peek" view for item details.
- Interactive filtering logic based on the Highlights Bar.

**Out of Scope:**
- Changes to the underlying LLM generation logic (unless simple metadata additions are required).
- New backend services.

## Context for Development

### Codebase Patterns

- **PrimeVue Components**: Extensive use of `Card`, `Button`, `Tabs`, `Badge`, and `Timeline`. Will introduce `Checkbox` and `Drawer`/`Sidebar` for the new features.
- **Tailwind CSS**: Utility-first styling. Custom executive styles will be encapsulated in `.executive-prose`.
- **Composition API**: Using `ref`, `computed`, and `onMounted` hooks.
- **Computed Dashboard Filtering**: The dashboard uses computed properties (`briefingItems`, `outcomeItems`) to manage the list of cards.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/web/src/views/Dashboard.vue` | Main dashboard view where the brief is rendered. Handles state and orchestration. |
| `apps/web/src/components/activity/OutcomeCard.vue` | Individual card component. Needs to support selection and action slots. |
| `apps/agent/src/processors/MorningBriefProcessor.ts` | Backend processor that generates the brief data. Defines the JSON structure. |
| `apps/web/src/components/activity/ThreadSummary.vue` | Sub-component for detailed thread summaries. Useful for the "Peek" view. |

### Technical Decisions

- **Automate Action**: Selected task IDs will be passed to a new `automateTasks` method in `Dashboard.vue` which calls the Supabase `tasks` table with a specific `domain_action`. Valid actions: `email.draft` (low-risk), `email.send` (high-risk), `calendar.schedule` (medium-risk). Invalid actions are rejected client-side before submission.
- **Timeout Strategy**: Client-side request timeout: 30 seconds. Max processing duration before auto-cancellation: 5 minutes. UI shows "Taking longer than expected..." after 10 seconds of processing. On timeout, show retry dialog with option to check status manually.
- **Handle Action**: Uses a PrimeVue `Sidebar` (Drawer) to "Peek" into the thread details without navigating away.
- **Interactive Filtering**: Clicking a "Highlight" pill sets an `activeFilter` ref which the `briefingItems` computed property respects.
- **Typography**: Custom class `.executive-prose` will handle the "WSJ" look (serif font, drop-caps, lead sentences).
- **State Synchronization**: The dashboard must maintain a Supabase Realtime subscription on the `tasks` table to update card statuses (`processing` → `done`/`error`) without requiring a full page refresh.
- **Source ID Parsing**: Regex pattern `/\[ID:\s*([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\]/g` (strict RFC 4122 UUID v4 validation). Validates version bit (4) and variant bits (8/9/a/b). Invalid UUIDs render as plain text.
- **Action Security**: High-risk actions (e.g., `email.send`) require a PrimeVue `ConfirmDialog` before execution. Low-risk actions (e.g., `email.draft`) can proceed without confirmation.
- **Bulk Error Handling**: If a bulk action partially fails, the Global Action Bar remains open. Failed items retain their selection state for easy retry. Successful items are deselected and show a transient success checkmark.

## Implementation Plan

### Tasks

- [ ] Task 1: Define Executive Prose Styles
  - File: `apps/web/src/style.css`
  - Action: Add `.executive-prose` base styles including serif font stack, drop-cap utilities, and lead-in sentence styling.
  - Notes: Ensure it works well with existing Tailwind colors.

- [ ] Task 2: Enhance OutcomeCard for Selection
  - File: `apps/web/src/components/activity/OutcomeCard.vue`
  - Action: Add a `Checkbox` in the top-left (or beside title). Add a `selected` prop/emit. Add an `<actions>` slot in the footer for single-item actions.
  - PrimeVue API: Use `<Checkbox v-model="isSelected" :binary="true" />`. Emit `update:selected` event on change.
  - Notes: The checkbox should only appear in the "Briefing" tab view. Use `indeterminate` prop for parent-level "select all" state.

- [ ] Task 2b: Visual State Locking
  - File: `apps/web/src/components/activity/OutcomeCard.vue`
  - Action: Implement a visual "locked" state (e.g., lower opacity + small spinner) when an item's status is 'processing'. Disable interaction during this state.

- [ ] Task 3: Build Executive Highlights Bar & Filter Logic
  - File: `apps/web/src/views/Dashboard.vue`
  - Action: Implement the UI for the Highlights pills (Wins/Blockers/Risks). Wire up an `activeFilter` ref. Update `briefingItems` computed to filter by topic/priority based on the active pill.

- [ ] Task 4: Implement Multi-Select & Action Bar
  - File: `apps/web/src/views/Dashboard.vue`
  - Action: Track `selectedItemIds` in a ref. Create a fixed-position Global Action Bar that appears when `selectedItemIds.length > 0`.
  - PrimeVue API: Import `useConfirm` from 'primevue/useconfirm' for high-risk action confirmations. Use `ConfirmDialog` component in template.
  - Security: Before executing `email.send` or similar high-risk actions, call `confirm.require()` with appropriate header/message. Low-risk actions (e.g., `email.draft`) skip confirmation.

- [ ] Task 4b: Bulk Action Hardening & Timeouts
  - File: `apps/web/src/views/Dashboard.vue`
  - Action: Implement a batching loop for bulk requests (max 5 concurrent). Add an `isProcessing` state to the Global Action Bar.
  - Timeouts: Client-side request timeout 30s per batch. Show "Taking longer than expected..." after 10s. Max total processing time 5 minutes before auto-cancellation.
  - State Sync: Ensure the existing `subscribeToTable('tasks')` logic in `onMounted` updates card statuses in real-time. When a task status changes from 'processing' to 'done' or 'error', the UI should reflect this without page refresh.
  - Notes: Create a single aggregated notification for success/failure instead of multiple toasts.

- [ ] Task 5: Side-panel "Peek" Integration
  - File: `apps/web/src/views/Dashboard.vue`
  - Action: Add a PrimeVue `Drawer` (Sidebar). When "Handle It" is clicked, load the `selectedItem` into the drawer and display `ThreadSummary.vue`.
  - PrimeVue API: Use `<Drawer v-model:visible="isPeekOpen" position="right" :modal="true" :dismissable="true">`. Set `header` prop to item title. Use `#container` slot for custom layout if needed.
  - Data Freshness: When Peek opens, capture `openedAt` timestamp. If the Realtime subscription detects a change to this item while Peek is open, show a "Data Updated" toast with "Refresh" button. Clicking "Refresh" reloads the item data from Supabase without closing the panel.

- [ ] Task 5b: Error Aggregator & Failure Classification
  - File: `apps/web/src/views/Dashboard.vue`
  - Action: Implement a "Failure Summary" dialog that appears if any bulk actions fail.
  - Network Failures (5xx, timeout, CORS): Show per-item "Retry" buttons with exponential backoff. Network errors can be retried individually.
  - Business Logic Failures (validation errors, invalid state): Show error details per item. These require user intervention and cannot be auto-retried.
  - Always provide "Retry All" for network failures only.

- [ ] Task 6: Narrative Stylizer Component/Utility
  - File: `apps/web/src/views/Dashboard.vue`
  - Action: Create a helper to parse `summary_text`. Use regex to wrap `[SOURCE_ID]` in styled span components. Implement a "BLUF" box as the first paragraph.
  - Regex Pattern: `/\[ID:\s*([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\]/g` - strict RFC 4122 UUID v4 validation (checks version=4, variant=8/9/a/b). Example: `[ID: 550e8400-e29b-41d4-a716-446655440000]`
  - Edge Cases: Handle text starting with quotes/spaces before drop-cap. Handle nested brackets by matching first `]`.
  - BLUF Detection: First sentence ending in `!` or `?` or `.` followed by newline.

### Acceptance Criteria

- [ ] AC 1: Visual Highlights & Filtering
  - Given the dashboard is loaded, when the user clicks the "Blockers" highlight pill, then the briefing grid is filtered to show only items with high-priority or blocker status.
- [ ] AC 2: Multi-Item Automation
  - Given multiple items are selected via checkboxes, when the user clicks "Automate" in the Global Action Bar, then a bulk task request is sent to Supabase and the UI shows a unified loading state.
- [ ] AC 3: Non-Destructive "Peek"
  - Given the user wants to see details of a thread, when they click "Handle It", then a side-panel opens with the full summary, allowing the user to return to the dashboard instantly by closing the panel.
- [ ] AC 4: Executive Typography
  - Given a morning brief is present, when rendered, the summary text uses a serif font with a clear visual distinction for lead sentences and source citations.
- [ ] AC 5: Security Confirmation
  - Given a user selects high-risk actions (e.g., `email.send`), when they click "Automate", then a PrimeVue ConfirmDialog appears requiring explicit confirmation before proceeding. Low-risk actions proceed immediately.
- [ ] AC 6: Timeout Handling
  - Given a bulk automation request exceeds 30 seconds, when the timeout is reached, then the UI shows a "Request timed out" dialog with options to "Check Status" or "Retry".
- [ ] AC 7: Race Condition Prevention
  - Given a user has selected an item, when the item's status changes in Supabase before automation is triggered, then the UI shows a warning "Item state changed" and refreshes the card data before allowing action.
- [ ] AC 8: Data Freshness in Peek
  - Given the Peek panel is open, when the underlying item data changes via Realtime, then a toast notification appears with a "Refresh" button to update the panel content without closing it.

## Additional Context

### Dependencies

- **PrimeVue Drawer**: For the "Peek" functionality. Props: `v-model:visible`, `position="right"`, `header`, `#container` slot.
- **PrimeVue Checkbox**: For selection logic. Props: `v-model`, `binary`, `indeterminate`, `disabled`.
- **PrimeVue ConfirmDialog**: For high-risk action confirmations. Use with `useConfirm` composable.
- **Tailwind Typography**: Manual utility classes for the WSJ look (font-serif, tracking-tight, leading-relaxed).

### Testing Strategy

- **Vitest Unit Tests**:
  - Test `briefingItems` computed property filtering logic (test `activeFilter` state changes).
  - Test narrative parsing utility with various source ID formats and edge cases (nested brackets, special chars).
  - Test batching logic for bulk requests (verify max 5 concurrent limit).
- **Playwright E2E Tests**:
  - Multi-select workflow: Select 3 cards → Click "Automate" → Verify Global Action Bar shows progress → Verify success state.
  - Side-panel "Peek": Click "Handle It" → Verify Drawer opens → Verify closing returns to dashboard without reload.
  - Realtime sync: Trigger a task status change in Supabase → Verify card updates without page refresh.
- **Manual Verification**:
  - Visual regression check for "Executive Prose" typography across browsers.
  - Accessibility check for checkbox selection and keyboard navigation.

### Notes

- **High-Risk**: Strict RFC 4122 UUID validation required for source ID parsing. Invalid UUIDs must gracefully fall back to plain text.
- **Limitation**: Bulk automation initially supports three action types (`email.draft`, `email.send`, `calendar.schedule`). Additional actions require schema updates.
- **Assumption**: Supabase Realtime maintains stable WebSocket connection. Degradation gracefully falls back to manual refresh button.

### Security Considerations

- **Confirmation for High-Risk Actions**: Use PrimeVue `ConfirmDialog` (via `useConfirm` composable) before executing high-risk automation actions (e.g., `email.send`). Low-risk actions (e.g., `email.draft`) can proceed without confirmation.
- **State Validation & Optimistic Locking**: Before executing any action, verify the item's current status and `updated_at` timestamp haven't changed since selection. Store `selectedItemSnapshot` (containing `id`, `status`, `updated_at`) at selection time. Before action execution, compare current Supabase values against snapshot. If mismatch, show "Item state changed" warning and refresh the card.
- **Rate Limiting**: Button debounce of 300ms minimum on all action buttons. Backend RLS policy should throttle task creation to max 10 requests per 10 seconds per user.
- **PII Handling**: Ensure the "Peek" panel redacts sensitive information using the same `PerimeterGuard` patterns used in the backend.
