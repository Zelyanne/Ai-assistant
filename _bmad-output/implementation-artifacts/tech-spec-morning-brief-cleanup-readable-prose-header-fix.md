---
title: 'Morning Brief Cleanup (Readable Prose + Header Fix)'
slug: 'morning-brief-cleanup-readable-prose-header-fix'
created: '2026-02-16T00:40:06.414Z'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Vue 3', 'TypeScript', 'Vite', 'PrimeVue', 'Tailwind CSS', 'Pinia', 'Supabase', 'Vitest']
files_to_modify: ['apps/agent/src/processors/MorningBriefProcessor.ts', 'packages/shared/src/schemas.ts', 'apps/web/src/views/Dashboard.vue', 'apps/web/src/utils/morningBriefFormat.ts', 'apps/web/src/utils/morningBriefFormat.spec.ts', 'apps/web/src/components/layout/AppHeader.vue', 'apps/web/src/style.css', 'apps/web/src/views/Dashboard.spec.ts']
code_patterns: ['PrimeVue Components', 'PrimeVue Tooltip directive (v-tooltip) registered in main.ts', 'PrimeVue ConfirmDialog via useConfirm', 'Dashboard narrative rendered via v-html string transform', 'Tailwind responsive utilities (sm:hidden / hidden sm:inline)']
test_patterns: ['Vitest + @vue/test-utils component/view tests (apps/web/src/views/*.spec.ts)']
---

# Tech-Spec: Morning Brief Cleanup (Readable Prose + Header Fix)

**Created:** 2026-02-16T00:40:06.414Z

## Overview

### Problem Statement

The Morning Brief narrative currently renders as a dense, hard-to-scan wall of text. Source IDs also show up inline in the prose, adding visual noise. Separately, the header "Emergency Brake" control wraps/clips in constrained layouts, producing a broken-looking chip on the right side of the top bar.

### Solution

Improve Morning Brief readability and layout by:

- Tightening the agent prompt so the generated narrative consistently follows: 1-2 sentence BLUF, a blank line, then short paragraphs.
- Updating the dashboard narrative renderer to strip source IDs from the prose and render a compact "Sources" area separately.
- Making the header "Emergency Brake" responsive: icon-only on small screens with tooltip; full label on larger screens.

### Scope

**In Scope:**
- Prompt formatting changes for Morning Brief narrative structure.
- Dashboard rendering changes for narrative + sources presentation.
- Header responsiveness fix for the Emergency Brake control.

**Out of Scope:**
- Changing brief decision logic (what becomes actionable vs informational).
- New backend services or database schema changes.

## Context for Development

### Codebase Patterns

- Vue 3 (Composition API) + PrimeVue components + Tailwind utility styling.
- Morning Brief narrative currently renders via `v-html` after a text-to-HTML transform.
- Styling for the narrative uses a custom `.executive-prose` CSS block.
- Tooltip directive is already wired globally (`app.directive('tooltip', Tooltip)`) so templates can use `v-tooltip` and positional modifiers (e.g. `.top`, `.right`).

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/agent/src/processors/MorningBriefProcessor.ts` | Prompt that controls narrative formatting and source ID conventions. |
| `apps/web/src/views/Dashboard.vue` | Renders Morning Brief narrative; contains the narrative transform helper. |
| `apps/web/src/style.css` | Contains `.executive-prose` typography and callout/source styling. |
| `apps/web/src/components/layout/AppHeader.vue` | Contains the Emergency Brake UI that needs responsive behavior. |
| `packages/shared/src/schemas.ts` | Shared Zod schemas/types; `MorningBriefSchema` currently omits `metadata` though backend writes it. |
| `apps/web/src/main.ts` | PrimeVue + Tooltip directive registration (confirms `v-tooltip` is available). |
| `apps/web/src/views/Dashboard.spec.ts` | Existing Vitest patterns for dashboard rendering and data-fetch mocking. |

### Technical Decisions

- Source IDs will be removed from the narrative prose and displayed in a separate "Sources" area.
- Primary fix lever: prompt tightening in the agent processor (with UI renderer as a safety net).
- Emergency Brake becomes icon-only on small widths with tooltip.

Data and format contracts:

- Canonical source ID is `ingested_threads.id` (UUID). New briefs must persist these IDs in `metadata.source_ids`.
- Legacy fallback parser may extract UUIDs from `summary_text` only for backward compatibility.
- Source chips display masked IDs only (`abcd1234...`), not full raw IDs.
- Formatter output contract for `v-html` is strict: only `<div class="bluf-box">`, `<p>`, `<section class="sources-row">`, and `<span class="source-pill">` may be generated.

Additional implementation constraints discovered:

- `apps/web/src/views/Dashboard.vue` currently injects LLM text with `v-html`; we must HTML-escape all raw text before wrapping it in our own markup to avoid XSS. This includes source IDs and tooltip text.
- The backend (`apps/agent/src/processors/MorningBriefProcessor.ts`) already writes `metadata` into `morning_briefs`; the gap is specifically that `metadata.source_ids` is not guaranteed today and shared schema typing does not model metadata.
- Renderer must normalize malformed metadata safely: non-array `source_ids` => empty array; non-string entries removed; duplicates removed; cap at 50 entries.

External references used to anchor decisions:

- PrimeVue docs confirm `v-tooltip.{top|bottom|left|right}` modifiers and recommend `aria-label` on icon-only buttons.
- GitHub examples show a stable Tailwind pattern for responsive labels inside PrimeVue Button: icon element visible on mobile + `<span class="hidden sm:inline">Label</span>` for desktop.

## Implementation Plan

### Tasks

- [x] Task 1: Tighten Morning Brief prompt for structured prose
  - File: `apps/agent/src/processors/MorningBriefProcessor.ts`
  - Action: Update `MORNING_BRIEF_PROMPT` and related schema descriptions so the generated `narrative_overview` consistently outputs: 1-2 sentence BLUF, one blank line, then short paragraphs (2-3 sentences each).
  - Notes: Explicitly forbid inline source IDs/UUIDs in the narrative. IDs should remain in structured fields only.

- [x] Task 2: Persist brief source IDs in morning_briefs metadata
  - File: `apps/agent/src/processors/MorningBriefProcessor.ts`
  - Action: When inserting into `morning_briefs`, merge `metadata.source_ids` populated from the set of triaged `ingested_threads.id` values used for the brief.
  - Notes: Do not replace existing metadata keys; preserve `metadata.actionable_items` and add `source_ids` deterministically.

- [x] Task 3: Align shared types to include optional metadata on MorningBrief
  - File: `packages/shared/src/schemas.ts`
  - Action: Extend `MorningBriefSchema` with a typed optional metadata object: `{ source_ids?: string[]; actionable_items?: Array<{ source_id: string; title: string; action_required: string; priority: 'high'|'medium'|'low'; topic: string }> }`.
  - Notes: Avoid `z.any()` for this path; unknown metadata keys may be tolerated via `.passthrough()`.

- [x] Task 4: Implement a safe narrative formatter (escape + strip IDs + paragraphing)
  - File: `apps/web/src/utils/morningBriefFormat.ts` (new)
  - Action: Create a formatter that:
    - HTML-escapes raw narrative text.
    - Extracts/normalizes source IDs (from `metadata.source_ids` if present; else parse UUIDs from the raw text as fallback).
    - Removes any IDs from the rendered narrative.
    - Produces HTML with strict allowed tags only: BLUF box (first paragraph) + `<p>` blocks.
    - Applies deterministic normalization if model output is poor (split long blocks, trim repeated whitespace, enforce paragraph boundaries).
  - Notes: This replaces ad-hoc `stylizeNarrative()` logic and reduces XSS risk with `v-html`.

- [x] Task 5: Update Dashboard Morning Brief rendering to use formatter + show Sources area
  - File: `apps/web/src/views/Dashboard.vue`
  - Action:
    - Replace `stylizeNarrative()` usage with the new formatter output.
    - Render a compact "Sources" area below the narrative (count + masked chips).
    - Ensure legacy briefs (no `metadata.source_ids`) still render: IDs stripped from prose, and sources extracted from text if available.
    - If no sources can be recovered, render explicit fallback text: "Sources unavailable for this brief.".
  - Notes: Keep the existing `executive-prose` container; ensure no raw UUID strings remain visible in prose or source chip labels.

- [x] Task 6: Add/adjust CSS for Sources area (compact + consistent)
  - File: `apps/web/src/style.css`
  - Action: Add styles under `.executive-prose` for a Sources row (spacing, muted color, wrap) and chip styling (reuse `.source-pill` or add a more specific class).
  - Notes: Avoid introducing new typography stacks; align to existing executive palette.

- [x] Task 7: Make Emergency Brake responsive (icon-only on small screens)
  - File: `apps/web/src/components/layout/AppHeader.vue`
  - Action:
    - Update the Emergency Brake Button markup to hide the label on small screens (`<span class="hidden sm:inline">Emergency Brake</span>`).
    - Add `aria-label="Emergency Brake"`.
    - Add tooltip (`v-tooltip.bottom="'Emergency Brake'"`).
    - Prevent wrapping/clipping with `whitespace-nowrap` + `shrink-0`, and reduce padding on small screens (e.g., `!px-3 sm:!px-4`).
  - Notes: `aria-label` is the required accessibility contract; tooltip is progressive enhancement and must not be the only accessible label on touch devices.

- [x] Task 8: Add unit tests for formatter and minimal regression coverage
  - File: `apps/web/src/utils/morningBriefFormat.spec.ts` (new)
  - Action: Add Vitest tests covering:
    - Escaping: `<script>` is escaped, not injected.
    - Stripping IDs: UUIDs in input do not appear in output prose HTML.
    - Paragraphing: single-block input still results in BLUF + paragraphs (or at minimum BLUF only, with a hard cap).
    - Sources fallback: parses UUIDs from text when `metadata.source_ids` absent.
    - Malformed metadata: invalid `source_ids` values are safely ignored/normalized.
  - Notes: Keep tests deterministic; no DOM required.

- [x] Task 9: Add Dashboard integration regression assertion for sources/prose split
  - File: `apps/web/src/views/Dashboard.spec.ts`
  - Action: Add at least one non-optional test that verifies no inline UUID appears in rendered prose and a Sources section is present (or fallback message appears).
  - Notes: This is mandatory, not optional.

### Acceptance Criteria

- [ ] AC 1: Given a Morning Brief exists, when the Briefing tab renders, then `narrative_overview` is displayed as: BLUF of 1-2 sentences, one blank-line separation, then paragraphs of at most 3 sentences each.
- [ ] AC 2: Given the brief contains source IDs (via `metadata.source_ids` or legacy inline UUIDs), when rendered, then no UUIDs appear in the narrative prose and a compact "Sources" section is displayed separately.
- [ ] AC 3: Given the narrative or metadata contains HTML-like input (e.g. `<script>alert(1)</script>`), when rendered, then prose, source labels, and tooltip content are escaped and no executable markup is injected.
- [ ] AC 4: Given a small viewport, when the top header renders, then Emergency Brake is icon-only (label hidden), remains single-line (no wrap/clipping), always has an `aria-label`, and optionally shows tooltip where supported.
- [ ] AC 5: Given a new morning brief is generated, when saved to `morning_briefs`, then the inserted row contains `metadata.source_ids` representing the triaged thread IDs used to generate the brief.
- [ ] AC 6: Given malformed `metadata.source_ids` (null, object, mixed types, duplicates), when rendered, then the app does not error, invalid values are discarded, and valid unique IDs (max 50) are used.
- [ ] AC 7: Given a brief with no parseable source IDs in metadata or prose, when rendered, then the Sources row shows "Sources unavailable for this brief.".

## Additional Context

### Dependencies

- PrimeVue Tooltip directive (`v-tooltip`) is already registered globally in `apps/web/src/main.ts`.
- PrimeVue Button accessibility guidance: icon-only buttons should include `aria-label`.
- No new external dependencies required.

### Testing Strategy

- Unit tests (Vitest): `apps/web/src/utils/morningBriefFormat.spec.ts` for escaping, stripping, and paragraph formatting.
- UI regression (Vitest): add mandatory `Dashboard.spec.ts` assertion for prose/source separation and no inline UUID leakage in prose.
- Manual:
  - Generate a new brief and confirm: prose has BLUF + paragraphs, no inline IDs, Sources appear.
  - Resize to mobile widths and confirm Emergency Brake no longer wraps/clips; `aria-label` remains present; tooltip appears where platform supports it.

### Notes

- High-risk: `v-html` rendering. Must escape all raw narrative text before injecting markup.
- Backward compatibility: handle existing briefs without `metadata.source_ids` by extracting UUIDs from `summary_text` and stripping them from prose.
- Type drift risk: backend writes `metadata` today, but shared `MorningBriefSchema` does not model it; align schema to avoid TS workarounds.
- Privacy guardrail: render masked source IDs only in UI.
- Determinism guardrail: renderer normalization rules are authoritative if model output violates prompt format.

## Finalization

This spec is confirmed and ready for development.

## Implementation Complete

- Status: Completed
- Tests: `npx pnpm -C apps/web test`

## Review Notes

- Adversarial review completed
- Findings: 15 total, 4 fixed, 11 skipped
- Resolution approach: auto-fix

Fixes applied:

- Backend enforcement: strip UUID/source-id leaks from prose before saving (`apps/agent/src/processors/MorningBriefProcessor.ts`)
- Backend validation: drop actionable items with unknown `source_id` (`apps/agent/src/processors/MorningBriefProcessor.ts`)
- Formatter hardening: assert only allowed tags emitted; fallback to fully escaped paragraph (`apps/web/src/utils/morningBriefFormat.ts`)
