---
title: 'Agency Tier Refinement, Email Body Access & Message UI'
slug: 'agency-tier-email-body-message-ui'
created: '2026-02-04'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript', 'Vue 3', 'Node.js', 'Supabase', 'Google APIs', 'Zod']
files_to_modify: [
  'apps/agent/src/services/google.ts',
  'apps/agent/src/guards/PerimeterGuard.ts',
  'apps/web/src/components/layout/AppSidebar.vue',
  'apps/web/src/views/Settings.vue',
  'supabase/migrations/ (add label_preferences to workspace_integrations)',
  'packages/shared/src/schemas.ts'
]
code_patterns: [
  'Service-based architecture with dependency injection',
  'Repository pattern via Supabase client',
  'PII redaction with reversible placeholders',
  'Agency tier enforcement (Public/Controlled/Restricted)',
  'Task queue pattern for async processing'
]
test_patterns: [
  'Vitest for unit tests (*.spec.ts)',
  'Integration tests alongside services'
]
---

## Overview

### Problem Statement
The current system has four critical limitations:
1. **Data Depth:** Email ingestion only captures snippets, preventing accurate AI analysis.
2. **Process Blocking:** The `PerimeterGuard` incorrectly restricts essential background tasks (Triage, Morning Brief) that should be autonomous.
3. **Visibility:** Users have no interface to view classified emails or inspect the AI's categorization logic (Topics/Categories).
4. **Ingestion Control:** Users cannot control which email categories (Primary, Social, Updates) are ingested, leading to noise.

### Proposed Solution
1. **Upgrade Ingestion:** Refactor `GoogleIngestionService` to fetch and store full email bodies (`messages.get`) securely.
2. **Label Filtering:** Implement settings to fetch available Gmail labels (Principal/Primary, Social, etc.) and allow users to select which ones to ingest.
3. **Refine Agency Guard:** Implement context-aware security that permits "Background/Analysis" tasks while maintaining strict gates for "Execution/Side-Effect" actions.
4. **New Message UI:** Add a "Messages" sidebar module with "Topic" and "Category" sub-views to visualize the classified email stream.

### Scope
- **In Scope:**
    - `apps/agent`: Ingestion Service upgrade (Body + Label Filtering), PerimeterGuard refactor.
    - `apps/web`: New "Messages" sidebar item, List Views for Topics/Categories, Settings UI for Label Selection.
    - `packages/shared`: Schema updates for full email body and label preferences.
    - Database migrations for new columns.
- **Out of Scope:**
    - Sending emails from this new UI (Read-only/Triage view for now).
    - Real-time email sync (keep existing 15-30 min polling).

## Context for Development

### Codebase Patterns
- **Service Architecture**: Business logic organized in `apps/agent/src/services/` (google.ts, agency.ts, etc.)
- **Guard Pattern**: Security/PII handling in `apps/agent/src/guards/PerimeterGuard.ts`
- **Vue 3 Frontend**: Composition API with PrimeVue components (pi icons)
- **Database**: Supabase with RLS policies, migration-based schema management
- **Shared Package**: `@ai-assistant/shared` contains schemas, types, encryption utils

### Files to Reference

| File | Purpose |
|------|---------|
| `apps/agent/src/services/google.ts` | Current ingestion logic (needs full body extraction) |
| `apps/agent/src/guards/PerimeterGuard.ts` | Security enforcement (needs context-aware mode) |
| `apps/agent/src/services/agency.ts` | Agency tier retrieval |
| `apps/web/src/components/layout/AppSidebar.vue` | Sidebar navigation (add Messages menu) |
| `apps/web/src/views/Settings.vue` | Settings page (add label selection) |
| `apps/web/src/components/SecurityPerimeterSettings.vue` | Existing agency tier UI |
| `supabase/migrations/20260114000000_core_and_domain_schema.sql` | Base schema reference |
| `packages/shared/src/schemas.ts` | Zod schemas for type safety |

### Technical Decisions
1. **Email Body Storage**: Store full body in new `body` column (encrypted) rather than JSONB metadata for query performance.
2. **Label Filtering**: Store selected label IDs in `workspace_integrations.label_preferences` as JSONB array.
3. **Guard Context Modes**: Add `mode: 'analysis' | 'execution'` parameter to `PerimeterGuard.filter()` - analysis mode bypasses tier checks for read-only operations.
4. **UI Structure**: Messages sidebar item with nested routes `/messages/topic` and `/messages/category` using Vue Router.

### Database Schema Notes
- **ingested_threads** currently has: `id`, `organization_id`, `external_id`, `subject`, `category`, `priority_score`, `summary`, `metadata`, timestamps
- **workspace_integrations** currently has: `id`, `organization_id`, `provider`, `encrypted_creds`, `sync_status`, `last_sync_at`, timestamps
- **agency_perimeters** has: `id`, `organization_id`, `topic_name`, `tier` (Public/Controlled/Restricted)

### Security Considerations
- Full email bodies MUST be encrypted using existing AES-256-GCM pattern in `@ai-assistant/shared/utils/encryption.js`
- PII redaction in PerimeterGuard is production-ready (names, emails, phones, addresses, IDs)
- All database queries must respect RLS policies (organization isolation)

## Architecture Decision Records

### ADR-001: Email Body Storage Strategy

**Context:** We need to store full email body content securely while maintaining query performance for AI analysis.

| Option | Approach | Trade-offs |
|--------|----------|------------|
| A | Dedicated `body` TEXT column (encrypted) | ✅ Fast queries, direct access, easy indexing<br>❌ Requires schema migration |
| B | Store in `metadata` JSONB field | ✅ No migration, flexible<br>❌ Slower queries, complex access patterns |

**Decision:** **Option A** - Dedicated encrypted column

**Rationale:** The body will be queried frequently by AI services for analysis. JSONB access patterns would add unnecessary complexity and performance overhead.

---

### ADR-002: PerimeterGuard Context Handling

**Context:** The Guard needs to distinguish between Background Analysis (no permission needed) and Execution Actions (tier enforcement required).

| Option | Approach | Trade-offs |
|--------|----------|------------|
| A | Add `mode: 'analysis' \| 'execution'` parameter | ✅ Clean, explicit, backwards compatible<br>❌ Slightly more complex method signature |
| B | Separate `filterAnalysis()` and `filterExecution()` | ✅ Clear separation<br>❌ Code duplication, maintenance overhead |
| C | Class inheritance (AnalysisGuard / ExecutionGuard) | ✅ Type safety<br>❌ Overkill, increases complexity |

**Decision:** **Option A** - Parameter-based mode selection

**Rationale:** Simplest approach that maintains backwards compatibility while adding explicit context control.

---

### ADR-003: Gmail Label Filtering Storage

**Context:** Users need to select which Gmail labels (Primary, Social, etc.) to ingest.

| Option | Approach | Trade-offs |
|--------|----------|------------|
| A | Store in `workspace_integrations.label_preferences` JSONB | ✅ Persistent, user-controlled, efficient<br>❌ Requires DB schema update |
| B | Runtime filtering via Gmail API | ✅ No storage needed<br>❌ Re-fetches every poll, no user persistence |

**Decision:** **Option A** - Database storage of preferences

**Rationale:** Better UX with persistent user preferences, more efficient API usage.

---

### ADR-004: Message UI Navigation Structure

**Context:** New Messages section needs Topic and Category sub-views.

| Option | Approach | Trade-offs |
|--------|----------|------------|
| A | Nested routes `/messages/topic`, `/messages/category` | ✅ Clean URLs, shared layout, domain-aligned<br>❌ Slightly more complex routing |
| B | Flat routes `/topics`, `/categories` | ✅ Simple routing<br>❌ Loses hierarchy, harder to extend |

**Decision:** **Option A** - Nested routing structure

**Rationale:** Better represents the domain model and allows for shared Message layout/components.

---

### ADR-005: Email Body Encryption Scope

**Context:** Full email bodies contain sensitive content requiring encryption.

| Option | Approach | Trade-offs |
|--------|----------|------------|
| A | Encrypt entire body field | ✅ Maximum security, follows existing pattern<br>❌ Can't search within body (search uses metadata) |
| B | Selective PII-only encryption | ✅ Allows body search<br>❌ Complex implementation, may miss PII |

**Decision:** **Option A** - Full body encryption

**Rationale:** Aligns with existing encryption pattern in `@ai-assistant/shared`. Search functionality operates on metadata (subject, summary, category) which remains unencrypted.

## Cross-Functional War Room Insights

### Implementation Phasing Strategy

Based on PM, Engineer, and UX Designer consensus:

```
Phase 1 (Week 1): Guard Context Mode Fix
  ├─ Files: PerimeterGuard.ts
  ├─ Impact: Unblocks Morning Brief, Triage automation immediately
  └─ Risk: Low (additive parameter, maintains backward compatibility)

Phase 2 (Week 2-3): Label Filtering Settings
  ├─ Files: Settings.vue, workspace_integrations migration
  ├─ Impact: Users control data noise
  └─ Risk: Low (UI + config only)

Phase 3 (Week 4): Full Body Ingestion
  ├─ Files: google.ts, schemas.ts, migrations
  ├─ Impact: AI can perform deep analysis
  └─ Risk: Medium (encryption load, storage increase)

Phase 4 (Week 5): Message UI Views
  ├─ Files: AppSidebar.vue, new views/components
  ├─ Impact: User visibility into AI organization
  └─ Risk: Low (presentation layer)
```

### Key Trade-offs Resolved

| Trade-off | Decision | Rationale |
|-----------|----------|-----------|
| **Sequencing Priority** | Guard → Labels → Body → UI | Unblock background automation first, then restrict firehose (labels), then widen pipe (full body), then presentation |
| **Message UI Structure** | Keep two views with education | Topics (watch-based) and Categories (AI-classified) serve different user mental models; explain via tooltips |
| **Historical Data** | No backfill, mark as "limited" | Avoid Gmail API quota issues and surprising UX; new threads get full bodies |
| **Settings Placement** | Integrations section | Label filtering is data source configuration, not security setting |
| **Default View** | Topic view first | More actionable for users than static categories |

### UX Considerations

**From Designer (Sam):**
- Users don't naturally distinguish "Topics" vs "Categories"—require clear labeling
- Without label filtering first, Message UI would overwhelm users with promotional/social emails
- Historical backfill could surface unexpected sensitive content in old emails

**Mitigations:**
- Add educational tooltips: "Topics = emails matching your watch keywords" vs "Categories = AI-classified importance"
- Phase 3 (label filtering) MUST ship before Phase 4 (Message UI)
- Mark pre-existing threads with visual indicator: "⚡ Limited analysis (snippet only)"

## Failure Mode Analysis

*Systematic exploration of component failures and prevention strategies*

### 1. Full Body Ingestion Service

| Failure Mode | Impact | Likelihood | Mitigation |
|--------------|--------|------------|------------|
| **Gmail API rate limiting** | Ingestion stalls, queue backs up | High (full bodies = more API calls) | Implement exponential backoff; batch label fetching; reduce `maxResults` temporarily |
| **Encryption CPU bottleneck** | Ingestion timeout, memory pressure | Medium (large bodies) | Encrypt asynchronously; add body size limit (e.g., 1MB); offload to worker thread |
| **Storage capacity exhaustion** | Database growth uncontrolled | Medium | Add retention policy (90 days default); archive old bodies to cold storage; monitor disk |
| **Email body >10MB (with attachments)** | Encryption failure, timeout | Low (but catastrophic) | Truncate bodies >1MB; store "oversized" flag; skip encryption for obvious attachments |
| **API credentials expired mid-ingestion** | Partial data, inconsistent state | Low | Wrap ingestion in transaction; rollback on auth failure; alert user to reconnect |

### 2. PerimeterGuard Context Mode

| Failure Mode | Impact | Likelihood | Mitigation |
|--------------|--------|------------|------------|
| **Legacy code doesn't pass `mode` param** | Defaults to 'execution', blocks background tasks | High (existing calls) | Set default to `'analysis'` for backward compatibility; audit all existing calls |
| **Misclassification: execution marked as analysis** | Security bypass, unauthorized actions | Medium | Require explicit tier override approval; log all analysis→execution escalations; audit trail |
| **Race condition in tier fetch** | Stale tier data allows wrong action | Low | Cache tier for 5min max; re-fetch before side-effect operations; version-check on write |
| **PII redaction fails on encrypted body** | Can't redact, plaintext leaks to LLM | Medium | Decrypt → redact → re-encrypt flow; never send unredacted PII to LLM |

### 3. Label Filtering System

| Failure Mode | Impact | Likelihood | Mitigation |
|--------------|--------|------------|------------|
| **Gmail label renamed by user** | Label ID invalid, ingestion breaks | Medium | Re-fetch labels on each sync; validate IDs before use; graceful fallback to all labels |
| **User unselects ALL labels** | Empty filter = zero emails ingested | Medium | UI validation (require ≥1 label); default to INBOX if empty; warning notification |
| **Missing Gmail labels scope** | Can't fetch available labels | Low | Check scopes during OAuth; re-auth flow if scope missing; fallback to hardcoded defaults |
| **Label hierarchy (nested labels)** | Complex filtering logic | Medium | Flatten label list for MVP; show full path in UI; document limitation |

### 4. Message UI (Topic & Category Views)

| Failure Mode | Impact | Likelihood | Mitigation |
|--------------|--------|------------|------------|
| **1000+ emails freeze browser** | UI unresponsive, user frustration | High (power users) | Implement virtual scrolling; paginate (50 per page); add date-range filter default |
| **User confusion: Topics vs Categories** | Support tickets, feature not used | High | Tooltips on first visit; onboarding tour; clear labels: "🔍 Topics you watch" vs "🏷️ AI-classified" |
| **Settings out of sync with ingestion** | User sees wrong emails | Medium | Real-time status indicator; "Last synced: 5 min ago"; refresh button with loading state |
| **Mobile layout breaks** | Unusable on phone | Medium | Responsive grid; collapsible sidebar; touch-friendly cards |

### 5. Database & Migration Risks

| Failure Mode | Impact | Likelihood | Mitigation |
|--------------|--------|------------|------------|
| **Migration adds `body` column to large table** | Lock timeout, ingestion downtime | Medium | Add as nullable first; backfill in batches; use `ALTER TABLE ... ADD COLUMN` without default |
| **Label preferences JSONB corruption** | Invalid filter config | Low | Schema validation on save; Zod parsing; fallback to defaults on parse error |
| **Phase 1 deployed, Phase 2 fails** | Guard fixed but no body data | Low | Feature flags per phase; rollback plan; monitor error rates post-deploy |

### 🔴 Critical Risks Requiring Immediate Attention

1. **API Rate Limiting (HIGH)** - Most likely to cause production issues
   - *Action:* Implement request queuing with rate limit awareness before Phase 2

2. **Legacy Guard Calls (HIGH)** - Backward compatibility risk
   - *Action:* Audit all existing `PerimeterGuard.filter()` calls before Phase 1 deploy

3. **Browser Performance (HIGH)** - UX degradation for power users
   - *Action:* Implement virtualization BEFORE Phase 4 launch, not after

4. **Encryption Bottleneck (MEDIUM)** - Could slow ingestion significantly
   - *Action:* Benchmark encryption on 1000 threads before committing to full rollout

## Implementation Plan

### Phase 1: Guard Context Mode Fix (Week 1)

**Goal:** Unblock background automation (Triage, Morning Brief) by distinguishing Analysis from Execution contexts.

- [ ] **Task 1.1:** Add `mode` parameter to `PerimeterGuard.filter()` method
  - File: `apps/agent/src/guards/PerimeterGuard.ts`
  - Action: Modify method signature to `filter(text: string, agencyTier: AgencyTier, requiredTier: AgencyTier, mode: 'analysis' | 'execution')`. Remove default value to enforce explicit choice.
  - Notes: Analysis mode skips tier enforcement; Execution mode maintains existing behavior

- [ ] **Task 1.2:** Update filter() logic to check mode before tier enforcement
  - File: `apps/agent/src/guards/PerimeterGuard.ts`
  - Action: Add conditional logic: if `mode === 'analysis'`, bypass tier comparison and only perform PII redaction
  - Notes: Ensure PII redaction still occurs in both modes for security

- [ ] **Task 1.3:** Audit all existing PerimeterGuard.filter() calls
  - Files: Search `apps/agent/src/**/*.ts` for filter() usage
  - Action: Identify all call sites; update to pass explicit 'analysis' or 'execution' mode
  - Notes: Background tasks (triage, brief) → 'analysis'; User-triggered actions → 'execution'

- [ ] **Task 1.4:** Update existing calls to pass appropriate mode
  - Files: `apps/agent/src/services/BriefingScheduler.ts`, Triage services
  - Action: Add `mode: 'analysis'` to background task calls; keep `mode: 'execution'` for action handlers
  - Notes: This is the critical fix that unblocks the Morning Brief

- [ ] **Task 1.5:** Add unit tests for analysis vs execution modes
  - File: `apps/agent/src/guards/PerimeterGuard.spec.ts`
  - Action: Test that analysis mode bypasses tier checks; test that execution mode enforces tiers
  - Notes: Ensure backward compatibility with existing tests

### Phase 2: Label Filtering Settings (Week 2-3)

**Goal:** Allow users to control which Gmail labels are ingested.

- [ ] **Task 2.1:** Create migration to add label_preferences to workspace_integrations
  - File: `supabase/migrations/20260212000000_add_label_preferences.sql`
  - Action: `ALTER TABLE workspace_integrations ADD COLUMN label_preferences JSONB DEFAULT '[]';`
  - Notes: Default to empty array (no filtering = all labels)

- [ ] **Task 2.2:** Add label_preferences to Zod schema
  - File: `packages/shared/src/schemas.ts`
  - Action: Add `labelPreferences: z.array(z.string())` to workspace integration schemas
  - Notes: Validate as array of Gmail label IDs

- [ ] **Task 2.3:** Create Gmail label fetching service
  - File: `apps/agent/src/services/google.ts` (add new method)
  - Action: Add `fetchGmailLabels()` method using `gmail.users.labels.list`
  - Notes: Cache results for 1 hour to reduce API calls

- [ ] **Task 2.4:** Create API endpoint for fetching available labels
  - File: `apps/agent/src/index.ts` (add route)
  - Action: Add `/api/gmail/labels` endpoint that returns user's available labels with name and ID
  - Notes: Requires valid Google auth token

- [ ] **Task 2.5:** Add label selection UI component
  - File: `apps/web/src/components/GmailLabelSelector.vue` (new)
  - Action: Create multi-select checkbox component with label names and descriptions
  - Notes: Group by category (System, User-created); show INBOX as recommended

- [ ] **Task 2.6:** Integrate label selector into Settings page
  - File: `apps/web/src/views/Settings.vue`
  - Action: Add "Email Ingestion" section with label selector; save to `workspace_integrations`
  - Notes: Add explanatory text: "Select which Gmail labels to include in AI analysis"

- [ ] **Task 2.7:** Update ingestion to respect label preferences
  - File: `apps/agent/src/services/google.ts`
  - Action: Modify `ingestGmail()` to pass `labelIds` filter to `threads.list` API
  - Notes: If `label_preferences` is empty array, skip filtering (backward compatible)

- [ ] **Task 2.8:** Add validation for label selection
  - File: `apps/web/src/components/GmailLabelSelector.vue`
  - Action: Require at least 1 label selected; show warning if INBOX not selected
  - Notes: Prevent accidental "no emails ingested" scenario

### Phase 3: Full Body Ingestion (Week 4)

**Goal:** Enable AI to access full email content for deeper analysis.

- [ ] **Task 3.1:** Create migration to add `body` column to ingested_threads
  - File: `supabase/migrations/20260205000000_add_body_to_ingested_threads.sql`
  - Action: `ALTER TABLE ingested_threads ADD COLUMN body TEXT;` (nullable, no default)
  - Notes: Nullable to avoid lock issues; existing threads will have NULL bodies

- [ ] **Task 3.2:** Update Zod schema for IngestedThread with body field
  - File: `packages/shared/src/schemas.ts`
  - Action: Add `body: z.string().optional()` to IngestedThread schema
  - Notes: Keep optional to handle pre-existing threads without bodies

- [ ] **Task 3.3:** Update TypeScript types for database
  - File: `packages/shared/src/database.types.ts`
  - Action: Add `body?: string` to IngestedThread type definition
  - Notes: Regenerate types after migration

- [ ] **Task 3.4:** Modify ingestGmail() to fetch and sanitize full message bodies
  - File: `apps/agent/src/services/google.ts`
  - Action: Inside `ingestGmail()`, extract body, decode base64url, and convert HTML to Markdown (using `turndown` or similar)
  - Notes: Store sanitized Markdown, not raw HTML, to reduce noise and storage size

- [ ] **Task 3.5:** Add body size limit and truncation logic
  - File: `apps/agent/src/services/google.ts`
  - Action: If body length > 1MB, truncate and set `metadata.is_truncated: true`
  - Notes: Prevent encryption bottleneck and storage bloat from oversized emails

- [ ] **Task 3.6:** Implement body encryption before storage
  - File: `apps/agent/src/services/google.ts`
  - Action: Import `encrypt` from `@ai-assistant/shared/utils/encryption.js`; encrypt body using Node.js Worker Threads
  - Notes: Offload encryption to worker thread to avoid blocking the main event loop during high-volume ingestion

- [ ] **Task 3.7:** Update tests for body ingestion
  - File: `apps/agent/src/services/google.spec.ts`
  - Action: Add test cases for body extraction, encryption, size limits, and base64 decoding
  - Notes: Mock Gmail API responses with realistic multipart structures

- [ ] **Task 3.8:** Add retry logic for Gmail API rate limiting
  - File: `apps/agent/src/services/google.ts`
  - Action: Implement exponential backoff (2^n seconds) with max 5 retries
  - Notes: Critical for production stability with full body fetching

### Phase 4: Message UI Views (Week 5)

**Goal:** Provide user visibility into classified emails by Topic and Category.

- [ ] **Task 4.1:** Add Messages menu item to AppSidebar
  - File: `apps/web/src/components/layout/AppSidebar.vue`
  - Action: Add `{ label: 'Messages', icon: 'pi pi-envelope', route: '/messages/topic' }` to navigation items
  - Notes: Use envelope icon; position after Dashboard

- [ ] **Task 4.2:** Create Vue Router routes for Message views
  - File: `apps/web/src/router/index.ts`
  - Action: Add `/messages` redirect to `/messages/topic`; add `/messages/topic` and `/messages/category` routes
  - Notes: Use nested route structure with shared Messages layout

- [ ] **Task 4.3:** Create MessagesLayout component with tab navigation
  - File: `apps/web/src/components/messages/MessagesLayout.vue` (new)
  - Action: Create layout with two tabs: "Topics You Watch" and "AI Categories"; use PrimeVue TabView
  - Notes: Add educational tooltip on each tab explaining the difference

- [ ] **Task 4.4:** Create MessageTopicView component
  - File: `apps/web/src/views/MessageTopicView.vue` (new)
  - Action: Display emails grouped by watch topics; show topic name, email count, priority score
  - Notes: Fetch from `ingested_threads` joined with `watch_topics`

- [ ] **Task 4.5:** Create MessageCategoryView component
  - File: `apps/web/src/views/MessageCategoryView.vue` (new)
  - Action: Display emails grouped by AI-classified category; show category name, email count
  - Notes: Categories: Critical, High Priority, Action Required, FYI, Low Priority

- [ ] **Task 4.6:** Create EmailListItem component with virtual scrolling
  - File: `apps/web/src/components/messages/EmailListItem.vue` (new)
  - Action: Show subject, snippet, category badge, date, "Limited analysis" indicator if body is null
  - Notes: Use PrimeVue VirtualScroller for performance with 1000+ emails

- [ ] **Task 4.7:** Add real-time sync status indicator
  - File: `apps/web/src/components/messages/MessagesLayout.vue`
  - Action: Show "Last synced: X minutes ago" from `workspace_integrations.last_sync_at`
  - Notes: Add refresh button that triggers manual sync

- [ ] **Task 4.8:** Add educational tooltips for Topics vs Categories
  - File: `apps/web/src/components/messages/MessagesLayout.vue`
  - Action: Add PrimeVue Tooltip: "Topics = emails matching your watch keywords" vs "Categories = AI-classified importance"
  - Notes: Show on first visit or add (?) help icon

## Acceptance Criteria

### Phase 1: Guard Context Mode

- [ ] **AC 1.1:** Given a background task calls `PerimeterGuard.filter()` with `mode: 'analysis'`, when the topic tier is 'Restricted', then the filter returns redacted text without escalation (allows processing to continue)

- [ ] **AC 1.2:** Given a user action calls `PerimeterGuard.filter()` with `mode: 'execution'` (or no mode), when the topic tier is below required tier, then the filter returns `isEscalated: true` with escalation reason

- [ ] **AC 1.3:** Given any filter call, when text contains PII (email, phone, name), then the output text has PII redacted regardless of mode

- [ ] **AC 1.4:** Given existing code that doesn't pass mode parameter, when filter is called, then it defaults to 'analysis' mode (backward compatible, doesn't break existing background tasks)

### Phase 2: Full Body Ingestion

- [ ] **AC 2.1:** Given a new email is ingested, when stored in database, then the `body` column contains encrypted full email content (not just snippet)

- [ ] **AC 2.2:** Given an email body > 1MB, when ingested, then body is truncated to 1MB and `metadata.is_truncated` is set to true

- [ ] **AC 2.3:** Given a pre-existing thread (before this feature), when viewed, then it displays "⚡ Limited analysis" indicator and body remains null

- [ ] **AC 2.4:** Given Gmail API returns rate limit error, when ingesting, then the system retries with exponential backoff up to 5 times before failing

- [ ] **AC 2.5:** Given encrypted body in database, when AI service requests body for analysis, then it is decrypted and PII-redacted before being sent to LLM

### Phase 3: Label Filtering

- [ ] **AC 3.1:** Given user opens Settings, when viewing "Email Ingestion" section, then they see a list of available Gmail labels with checkboxes

- [ ] **AC 3.2:** Given user selects specific labels (e.g., INBOX, Primary), when saving settings, then `workspace_integrations.label_preferences` is updated with selected label IDs

- [ ] **AC 3.3:** Given user has selected specific labels, when next ingestion runs, then only emails from those labels are fetched (verified by checking thread label IDs)

- [ ] **AC 3.4:** Given user attempts to uncheck all labels, when clicking save, then validation error appears requiring at least one label

- [ ] **AC 3.5:** Given user has no label preferences set (empty array), when ingestion runs, then all emails are ingested (backward compatible behavior)

### Phase 4: Message UI

- [ ] **AC 4.1:** Given user clicks Messages in sidebar, when page loads, then they see Topic view by default with emails grouped by watch topics

- [ ] **AC 4.2:** Given user switches to Category tab, when viewing, then they see emails grouped by AI-classified categories (Critical, High Priority, etc.)

- [ ] **AC 4.3:** Given 1000+ emails exist, when scrolling through Message view, then UI remains responsive with virtual scrolling (no browser freeze)

- [ ] **AC 4.4:** Given user hovers over Topics or Categories tab label, when tooltip appears, then it explains the difference ("Topics = emails matching your watch keywords" vs "Categories = AI-classified importance")

- [ ] **AC 4.5:** Given an email has no body (pre-existing), when displayed in list, then it shows "⚡ Limited analysis (snippet only)" visual indicator

- [ ] **AC 4.6:** Given emails have been recently ingested, when viewing Messages page, then sync status shows "Last synced: X minutes ago" with accurate timestamp

## Dependencies

### External Dependencies
- **Google Gmail API**: `users.messages.get` endpoint for full body fetching (already using `users.threads.list`)
- **Google Gmail API**: `users.labels.list` endpoint for fetching available labels
- **Supabase**: Database migrations and RLS policies

### Internal Dependencies
- `@ai-assistant/shared`: Encryption utilities (`encrypt`/`decrypt` functions)
- `@ai-assistant/shared`: Zod schemas for type validation
- `PerimeterGuard`: Must complete Phase 1 before Phase 2 body analysis uses the guard
- `workspace_integrations` table: Must have label_preferences column before Phase 3 UI

### Package Dependencies
- `googleapis`: Already installed, uses `gmail.v1` API
- `zod`: Already installed for schema validation
- PrimeVue UI components: Already installed for selectors and virtual scrolling

## Testing Strategy

### Unit Tests

- [ ] **PerimeterGuard Tests**: Mode-based filtering (analysis vs execution), backward compatibility, PII redaction in both modes
- [ ] **GoogleIngestionService Tests**: Body extraction from MIME parts, encryption/decryption, size limiting, base64url decoding
- [ ] **Label Preferences Tests**: JSONB serialization, validation, default empty array behavior

### Integration Tests

- [ ] **End-to-End Ingestion**: Full flow from Gmail API → encryption → database storage → retrieval → PII redaction
- [ ] **Settings → Ingestion Flow**: Change label preferences → trigger sync → verify filtered results
- [ ] **UI Load Testing**: Render 1000+ emails with virtual scrolling, measure render time (< 2 seconds)

### Manual Testing Steps

1. **Phase 1 Validation**:
   - Trigger Morning Brief generation
   - Verify it completes without escalation (uses analysis mode)
   - Trigger an action requiring tier check
   - Verify escalation occurs correctly (uses execution mode)

2. **Phase 2 Validation**:
   - Connect Gmail account
   - Wait for sync
   - Check database: `SELECT body FROM ingested_threads WHERE body IS NOT NULL`
   - Verify body is encrypted (not plaintext)

3. **Phase 3 Validation**:
   - Open Settings → Email Ingestion
   - Select only INBOX label
   - Trigger sync
   - Verify only INBOX emails appear (check email subjects match INBOX only)

4. **Phase 4 Validation**:
   - Navigate to Messages
   - Verify Topics and Categories tabs work
   - Test virtual scrolling with 100+ emails
   - Verify "Limited analysis" indicator appears on old emails

## Notes

### High-Risk Items (from Failure Mode Analysis)

1. **Gmail API Rate Limiting**: Full body fetching uses more quota. Mitigation: exponential backoff, batch processing, monitoring.

2. **Encryption Performance**: Large volumes may bottleneck. Mitigation: async processing, size limits, worker threads.

3. **Backward Compatibility**: Legacy Guard calls may break. Mitigation: default to 'analysis' mode, audit all existing calls before deploy.

4. **Browser Performance**: 1000+ emails without virtualization will freeze UI. Mitigation: implement virtual scrolling BEFORE launch.

### Known Limitations

- **No Historical Backfill**: Pre-existing threads remain snippet-only (by design to avoid API quota issues)
- **No Attachment Content**: Email bodies include text content only; attachments are not fetched or stored
- **Label Hierarchy**: Nested Gmail labels are flattened in the UI (MVP limitation)
- **Mobile UX**: Message list is optimized for desktop; mobile may require horizontal scroll for wide content

### Future Considerations (Out of Scope)

- **Real-time Sync**: Currently 15-30 min polling; future could use Gmail push notifications
- **Attachment Handling**: Future phase could fetch and store attachment metadata (not content)
- **Advanced Label Logic**: Future could support "exclude labels" or complex AND/OR logic
- **Message Threading**: Currently flat list; future could show threaded conversation view
- **Bulk Actions**: Future could add archive/mark-as-read actions from Message UI

### Security Checklist

- [ ] All email bodies encrypted at rest (AES-256-GCM)
- [ ] PII redacted before LLM context (names, emails, phones, addresses, IDs)
- [ ] RLS policies enforce organization isolation on all queries
- [ ] Label preferences validated before saving (prevent injection)
- [ ] Decrypted bodies never logged to console or files
- [ ] API tokens remain encrypted in `workspace_integrations.encrypted_creds`

## Tasks Summary

| Phase | Tasks | Est. Time | Risk Level |
|-------|-------|-----------|------------|
| 1 | 5 tasks | 2-3 days | Low |
| 2 | 8 tasks | 5-7 days | Medium |
| 3 | 8 tasks | 3-4 days | Low |
| 4 | 8 tasks | 3-4 days | Low |
| **Total** | **29 tasks** | **13-18 days** | **Medium** |
