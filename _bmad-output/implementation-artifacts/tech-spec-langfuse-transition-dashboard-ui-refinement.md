---
title: 'Transition to Langfuse and Dashboard UI Refinement'
slug: 'langfuse-transition-dashboard-ui-refinement'
created: 'Tue Feb 03 2026'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4, 5]
tech_stack: ['Langfuse', '@langfuse/langchain', 'Vue 3', 'PrimeVue', 'Supabase', 'Tailwind CSS', 'Zod']
files_to_modify: [
  'apps/agent/src/config/index.ts',
  'apps/agent/src/controller/nodes/reasoning.ts',
  'apps/agent/src/services/llm/tracing.ts',
  'apps/web/src/views/Dashboard.vue',
  'apps/web/src/components/activity/OutcomeCard.vue',
  'apps/agent/package.json'
]
code_patterns: [
  'Centralized Langfuse CallbackHandler utility with error handling and circuit breaker',
  'Vue 3 reactive state for DetailOverlay (Teleported Dialog) with click debouncing',
  'Conditional Tailwind classes for is-mini state (p-2 text-xs vs p-5 text-base)',
  'Executive Summary narrative layout in expanded view',
  'LangChain withStructuredOutput for traced structured LLM calls'
]
test_patterns: [
  'Manual verification of Langfuse traces',
  'UI accessibility (ESC key, focus trap, keyboard navigation) check',
  'Circuit breaker fallback when Langfuse is unreachable',
  'Performance benchmark with/without tracing enabled'
]
---

# Tech-Spec: Transition to Langfuse and Dashboard UI Refinement

**Created:** Tue Feb 03 2026

## Overview

### Problem Statement

The current system uses LangSmith for tracing, but there is a requirement to switch to Langfuse for better monitoring. Additionally, the dashboard UI needs refinements: Outcome Cards are too large and lack an expanded detail view, and the "Morning Brief" manual trigger button is missing from the template.

### Solution

1.  **Tracing Migration**: Replace LangSmith configuration with Langfuse. Implement a centralized `getLangfuseHandler()` utility with error handling and circuit breaker pattern. Refactor reasoning node to use LangChain's `withStructuredOutput` for complete trace coverage.
2.  **UI Refinement**: 
    - Add an `is-mini` mode to `OutcomeCard` for the main grid that preserves color-coding and status badges but reduces footprint.
    - Implement an "expanded" view using a PrimeVue `Dialog` that teleports to the body for a clean "hovering" rectangular report view.
    - Restore the `triggerMorningBrief` button in the `Dashboard.vue` header to allow manual brief regeneration.

### Scope

**In Scope:**
- Updating `apps/agent/src/config/index.ts` with Langfuse environment variables.
- Creating `apps/agent/src/services/llm/tracing.ts` for centralized handler logic with error handling.
- **Refactoring `apps/agent/src/controller/nodes/reasoning.ts`** to use LangChain's `withStructuredOutput` instead of direct MistralProvider calls.
- Integrating Langfuse `CallbackHandler` across all LLM calls.
- Overhauling `OutcomeCard.vue` with `is-mini` prop and layout.
- Implementing the expansion modal in `Dashboard.vue`.
- Adding the "Generate Brief" button with loading state to the Dashboard header.

**Out of Scope:**
- Migration of historical LangSmith data.
- Redesigning the underlying reasoning graph logic.

## Context for Development

### Codebase Patterns

- **Tracing**: Langfuse provides a `CallbackHandler` from `@langfuse/langchain`.
- **Structured Output**: LangChain's `withStructuredOutput()` method allows Zod schema validation with full tracing support.
- **Dashboard UI**: Responsive grid layout. Cards represent `OutcomeItem` types.
- **UI Expansion**: Use PrimeVue's `Dialog` with `shadow-2xl` and a focus on the "Executive Summary" narrative.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/agent/src/config/index.ts` | Config schema for tracing keys. |
| `apps/agent/src/controller/nodes/reasoning.ts` | LLM reasoning node - **requires refactoring to use LangChain withStructuredOutput**. |
| `apps/agent/src/services/llm/tracing.ts` | Centralized tracing service with circuit breaker. |
| `apps/web/src/views/Dashboard.vue` | Dashboard layout and expansion state. |
| `apps/web/src/components/activity/OutcomeCard.vue` | Outcome display component with new mini state. |
| `apps/agent/package.json` | Dependencies for Langfuse with version constraints. |

### Technical Decisions

- **LangChain Structured Output**: Replace direct `MistralProvider.generateStructured()` calls with `ChatMistralAI.withStructuredOutput()` to enable complete tracing coverage via CallbackHandler.
- **Circuit Breaker Pattern**: The tracing utility must handle Langfuse failures gracefully - log warning and continue without tracing if Langfuse is unreachable.
- **Concurrency Safety**: The tracing singleton must handle async context properly for LangGraph's concurrent task processing.
- **Dual-Write Period**: Implement feature flag to allow gradual rollout and quick rollback if issues arise.
- **Expansion View**: Use a `Dialog` with a custom "Executive Report" layout, ensuring the left-border color-coding is preserved to maintain the 'Win/Loss' context.
- **Accessibility**: Expansion modal must support keyboard dismissal, focus trap, and keyboard navigation to mini cards.

## Implementation Plan

### Phase 1: Tracing Infrastructure

- [x] **Task 1: Add Langfuse dependencies with version constraints**
  - File: `apps/agent/package.json`
  - Action: Add `"@langfuse/langchain": "^3.x"` and `"langfuse": "^3.x"` with explicit versions.
  - Notes: Pin to v3.x to avoid breaking changes in v4.

- [x] **Task 2: Update environment configuration with dual-support**
  - File: `apps/agent/src/config/index.ts`
  - Action: Add `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`, and `ENABLE_LANGFUSE_TRACING` (feature flag). Keep old LANGSMITH keys for rollback but deprecate.
  - Notes: Feature flag allows gradual rollout.

- [x] **Task 3: Create tracing utility service with error handling**
  - File: `apps/agent/src/services/llm/tracing.ts`
  - Action: Create singleton with circuit breaker pattern. If Langfuse init fails or is unreachable, return null handler and log warning. Do NOT crash the agent.
  - Notes: Must be async-context safe for concurrent LangGraph execution.

### Phase 2: Reasoning Node Refactoring (CRITICAL)

- [x] **Task 4: Refactor reasoning node to use LangChain structured output**
  - File: `apps/agent/src/controller/nodes/reasoning.ts`
  - Action: Replace `provider.generateStructured()` calls with `ChatMistralAI.withStructuredOutput(targetSchema, { name: schemaKey })`. This enables full tracing via CallbackHandler.
  - Before:
    ```typescript
    result = await provider.generateStructured(prompt, targetSchema);
    ```
  - After:
    ```typescript
    const structuredLlm = new ChatMistralAI({
      apiKey: config.MISTRAL_API_KEY,
      model: 'mistral-large-latest',
      temperature: 0,
      callbacks: langfuseHandler ? [langfuseHandler] : [],
    }).withStructuredOutput(targetSchema, { name: schemaKey });
    
    const response = await structuredLlm.invoke(prompt);
    result = { data: response, /* extract usage from response metadata */ };
    ```
  - **CRITICAL**: This ensures ALL reasoning calls are traced, not just the LangChain agent path.

- [x] **Task 5: Integrate Langfuse CallbackHandler into remaining LLM calls**
  - File: `apps/agent/src/controller/nodes/reasoning.ts`, `apps/agent/src/processors/BaseProcessor.ts`
  - Action: Import the tracing utility and pass the handler to all `ChatMistralAI` instances via `callbacks` array.
  - Notes: If tracing is disabled (feature flag off or Langfuse unreachable), pass empty callbacks array.

### Phase 3: UI Refinement

- [x] **Task 6: Implement `is-mini` state in OutcomeCard**
  - File: `apps/web/src/components/activity/OutcomeCard.vue`
  - Action: Add `isMini` boolean prop (default: `false`). When `true`:
    - Reduce padding: `p-2` instead of `p-5`
    - Reduce title: `text-sm font-semibold` instead of `text-lg font-bold`
    - Reduce summary: `text-xs line-clamp-2` instead of `text-base line-clamp-3`
    - Keep status badges and left-border color-coding fully visible
    - Add `tabindex="0"` and `@keydown.enter` handler for keyboard accessibility
  - Notes: Must be responsive - on mobile, mini mode might need different breakpoints.

- [x] **Task 7: Add expansion modal to Dashboard with debouncing**
  - File: `apps/web/src/views/Dashboard.vue`
  - Action: 
    - Add PrimeVue `Dialog` with `Teleport` to body
    - Create `selectedItem` ref and `isDetailOpen` boolean
    - Implement `openDetail(item)` with 300ms debounce to prevent race conditions from rapid clicks
    - Pass all `OutcomeItem` data to the Dialog content slot
    - Ensure Dialog has `shadow-2xl` for the "hovering" effect
    - Set `z-index` to 50 (above sidebar's 40)
  - Notes: Dialog should show full summary, all action buttons, and maintain color-coding context.

- [x] **Task 8: Restore Morning Brief trigger button with loading state**
  - File: `apps/web/src/views/Dashboard.vue`
  - Action: 
    - Add "Generate Brief" button in the executive header (right side, next to stats cards)
    - Bind `triggeringBrief` ref to button's `:loading` prop
    - Show toast notification on success/error using PrimeVue Toast
    - Position: Flex container in header, button as last element
    - Notes: This resolves the AC4 contradiction by explicitly defining the loading state UI.

### Phase 4: Testing & Validation

- [x] **Task 9: Add error handling and rollback capability**
  - File: `apps/agent/src/services/llm/tracing.ts`, `apps/agent/src/config/index.ts`
  - Action: 
    - Wrap Langfuse init in try-catch
    - If init fails, log warning and set `tracingEnabled = false`
    - Allow quick rollback via `ENABLE_LANGFUSE_TRACING=false` env var
  - Notes: Agent must continue functioning even if Langfuse is down.

- [x] **Task 10: Performance benchmark**
  - Action: Compare task execution time with/without tracing enabled. Document latency overhead.
  - Target: <50ms overhead per LLM call acceptable.

### Acceptance Criteria

- [x] **AC 1: Given a task is executed by the agent, when I check the Langfuse dashboard, then a full trace with ALL LLM calls is visible (including reasoning node structured output calls).**
- [x] **AC 2: Given the dashboard is loaded on desktop (≥1024px), when viewing the Outcome grid, then cards display 6 per row in mini format (vs current 3).**
- [x] **AC 3: Given I click on an Outcome Card, when the modal opens within 300ms, then I see the full summary and all action buttons ("View Trace", "Take Action" if escalation) in a high-focus rectangular layout with preserved color-coding.**
- [x] **AC 4: Given the Morning Brief button is clicked, when the task is queued, then the button shows loading state and a toast notification confirms "Brief generation started."**
- [x] **AC 5: Given Langfuse cloud is unreachable, when a task executes, then the agent continues without tracing and logs a warning (no crash).**
- [x] **AC 6: Given I press Tab on the keyboard, when navigating the dashboard, then I can focus each mini card and open it with Enter key.**

## Additional Context

### Dependencies

- `"@langfuse/langchain": "^3.18.0"` - LangChain integration with CallbackHandler
- `"langfuse": "^3.18.0"` - Base SDK for manual tracing if needed
- Circuit breaker pattern implemented in tracing utility

### Testing Strategy

- **Manual Tracing**: Verify complete trace visibility in Langfuse cloud including reasoning node calls
- **Visual Regression**: Compare card density: target 6 cards/row on desktop vs current 3
- **Functional**: Test "Generate Brief" button shows loading state and triggers Supabase task insert
- **Resilience**: Simulate Langfuse outage (block DNS) and verify agent continues functioning
- **Accessibility**: Keyboard navigation test (Tab to cards, Enter to open, ESC to close modal)
- **Performance**: Benchmark 10 tasks with/without tracing, measure latency overhead

### Privacy & Compliance

- **PII Handling**: Langfuse receives LLM prompts which may contain PII. The `PerimeterGuard` already redacts PII before LLM calls, but verify this applies to all prompts sent to tracing.
- **Data Retention**: Document that Langfuse cloud retains traces for 30 days (configurable in Langfuse project settings).
- **GDPR**: EU users' data goes to Langfuse Cloud (US-hosted). Consider self-hosted Langfuse for EU compliance if required.

### Rollback Plan

1. **Immediate**: Set `ENABLE_LANGFUSE_TRACING=false` - agent stops sending traces, continues operating
2. **Short-term**: Revert to previous commit if critical issues found
3. **Long-term**: Keep LANGSMITH env vars in config during transition period for quick fallback

### Known Limitations

- Historical LangSmith traces will not be migrated (out of scope)
- Reasoning node refactoring requires careful testing of all schema validations
- Mini card layout may need viewport-specific tuning for tablets (768px-1024px range)

### Notes

- The `is-mini` prop defaults to `false` for backward compatibility with other views
- The `Dialog` is `Teleport`ed to body with `z-index: 50` to avoid CSS overflow issues
- All direct `MistralProvider` calls in reasoning node must be migrated to `withStructuredOutput` for complete trace coverage
