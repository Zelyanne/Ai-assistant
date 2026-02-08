---
title: 'Fix Morning Brief Crash, MCP Auth, and Email Triage Data Injection'
slug: 'fix-morning-brief-mcp-triage'
created: '2026-02-05'
status: 'Implementation Complete'
stepsCompleted: [1, 2, 3, 4, 5]
tech_stack: ['Node.js', 'Typescript', 'Supabase', 'MCP SDK']
files_to_modify: 
  - 'apps/agent/src/services/mcp.ts'
  - 'apps/agent/src/processors/EmailTriageProcessor.ts'
  - 'apps/agent/src/processors/MorningBriefProcessor.ts'
  - 'supabase/migrations/20260205_fix_morning_brief_schema.sql'
  - 'packages/shared/src/types/database.ts'
code_patterns: 
  - 'Database Schema Migration with Rollback'
  - 'Defensive Property Access with Key Dumper'
  - 'Dual Logging Strategy (Console + agent_activity_log)'
  - 'TypeScript Interface Synchronization'
test_patterns: 
  - 'Unit Tests for Snippet Extraction Logic'
  - 'Integration Tests for MCP Connection'
  - 'Manual Verification via Workflow Trigger'
---

# Overview

## Problem Statement
The agent workflow is failing at multiple points:
1.  **Database Crash**: `MorningBriefProcessor` fails with "Could not find the 'metadata' column of 'morning_briefs'", stopping the workflow graph.
2.  **MCP Connection**: Connection to LangChain tools fails with a 400 error (SSE Non-200), likely due to an auth mismatch or opaque error response from the OAuth-enabled MCP server.
3.  **Missing Data**: `EmailTriageProcessor` is sending empty "EMAIL SNIPPET" fields to the LLM because it attempts to access `thread.metadata.snippet` on an object structure where that path may not exist or is `null`.

## Solution
1.  **Schema**: Add `metadata` column (JSONB) to `morning_briefs` table and `last_brief_generated_at` to `profiles` table in Supabase via a new migration.
2.  **MCP Client**: Enhance `mcp.ts` to log the full response body of the 400 error to diagnose the auth rejection. The current "Dual Header" patch is correct for the transport, but the server side might be rejecting the specific token format.
3.  **Triage Processor**: Fix the snippet extraction in `EmailTriageProcessor.ts` to correctly access the email body from the thread object, falling back gracefully if missing.

## Scope
- **Database**: `morning_briefs` and `profiles` tables
- **Code**: 
    - `apps/agent/src/services/mcp.ts`
    - `apps/agent/src/processors/EmailTriageProcessor.ts`
    - `apps/agent/src/processors/MorningBriefProcessor.ts`
    - `packages/shared/src/types/database.ts` (TypeScript types)

## Context for Development

### Codebase Patterns
- **Supabase**: Migrations are SQL files in `supabase/migrations`. Use sequential numbering (e.g., `000001_`, `000002_`) to ensure ordering.
- **MCP**: Using `@modelcontextprotocol/sdk` with `SSEClientTransport`.
- **Processors**: Workflow steps are encapsulated in "Processor" classes.
- **Logging**: Critical errors go to both `console.error` AND `agent_activity_log` table for persistence.

### Technical Decisions
- **MCP Diagnosis**: Since the headers *are* being sent (confirmed in code), the 400 error is likely a semantic rejection (invalid token scope/audience) rather than a syntax error. We will add deep logging to the `onerror` handler in `mcp.ts` to capture the server's error message.
- **Triage Data**: The `ingested_threads` table likely stores the email snippet in a different JSON path or at the top level. We will add defensive checks and logging to identify the correct path.
- **Type Safety**: All database schema changes MUST be reflected in TypeScript types to prevent future type mismatches.

# Implementation Plan

## Task Breakdown

### 1. Database Schema Fixes
- [x] **Task 1: Create Migration for Missing Columns**
  - **File**: `supabase/migrations/000042_fix_morning_brief_schema.sql` (Check existing migrations first, use next sequential number)
  - **Action**: 
    - Add `metadata` column (jsonb, default '{}') to `morning_briefs` table.
    - Add `last_brief_generated_at` column (timestamptz, nullable) to `profiles` table.
    - Create GIN index on `metadata` column for performance: `CREATE INDEX idx_morning_briefs_metadata ON morning_briefs USING GIN (metadata);`
    - Create index on `last_brief_generated_at` for queries: `CREATE INDEX idx_profiles_last_brief ON profiles(last_brief_generated_at);`
  - **Notes**: 
    - Use `IF NOT EXISTS` to be safe.
    - Ensure `DEFAULT '{}'::jsonb` is set for existing rows.
    - **ROLLBACK PLAN**: Include down migration:
      ```sql
      -- Down migration
      ALTER TABLE morning_briefs DROP COLUMN IF EXISTS metadata;
      ALTER TABLE profiles DROP COLUMN IF EXISTS last_brief_generated_at;
      DROP INDEX IF EXISTS idx_morning_briefs_metadata;
      DROP INDEX IF EXISTS idx_profiles_last_brief;
      ```

- [x] **Task 1b: Data Migration for Existing Rows**
  - **Action**: After schema migration, backfill existing `morning_briefs` rows with proper metadata structure:
    ```sql
    UPDATE morning_briefs 
    SET metadata = jsonb_build_object('actionable_items', COALESCE(blockers, '{}') || COALESCE(risks, '{}'))
    WHERE metadata IS NULL OR metadata = '{}'::jsonb;
    ```
  - **Verification**: Query to confirm: `SELECT id, metadata->>'actionable_items' FROM morning_briefs LIMIT 5;`

### 2. MCP Client Hardening
- [x] **Task 2: Enhance MCP Error Logging**
  - **File**: `apps/agent/src/services/mcp.ts`
  - **Action**: 
    - In `getClient`:
      1. Create the `SSEClientTransport`.
      2. **Crucial**: Bind `transport.onerror` *immediately* after creation and BEFORE `client.connect(transport)`.
      3. In the `onerror` handler, log to **BOTH** console AND `agent_activity_log`:
         ```typescript
         transport.onerror = async (err) => {
           const errorDetails = {
             message: err.message,
             code: (err as any).code,
             event: (err as any).event,
             stack: err.stack,
             timestamp: new Date().toISOString()
           };
           console.error('[MCP Transport Error]', JSON.stringify(errorDetails, null, 2));
           
           // Persist to agent_activity_log for debugging
           await supabase.from('agent_activity_log').insert({
             organization_id: orgId,
             agent_id: 'mcp-client',
             action_taken: 'mcp_transport_error',
             reasoning_trace: errorDetails
           });
         };
         ```
      4. If the error is an object with an `event` property (from `EventSource`), log `event.data` or `event.message` specifically.
    - Wrap `client.connect(transport)` in try/catch with detailed error inspection.
    - **Crucial**: Verify `googleAuthService` scopes include `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/calendar.readonly` which `workspace-mcp` requires.

### 3. Fix Triage Data Injection
- [x] **Task 3: Fix Email Snippet Extraction with Investigation**
  - **File**: `apps/agent/src/processors/EmailTriageProcessor.ts`
  - **Investigation Phase** (Run first to identify correct path):
    - Add temporary debug logging to dump full `thread` object structure:
      ```typescript
      console.log('[DEBUG] Thread structure:', JSON.stringify({
        id: thread.id,
        metadataKeys: thread.metadata ? Object.keys(thread.metadata) : 'null',
        hasSnippet: !!(thread.metadata as any)?.snippet,
        hasBody: !!(thread as any).body,
        hasSummary: !!(thread as any).summary_json,
        fullMetadata: thread.metadata
      }, null, 2));
      ```
    - Run triage on one thread and check logs to identify where snippet actually lives.
  - **Implementation Phase**:
    - Create robust extraction function:
      ```typescript
      function extractSnippet(thread: any): string {
        // Priority order: metadata.snippet > body > summary_json.snippet > ''
        return (thread.metadata as any)?.snippet 
          || (thread as any).body 
          || (thread as any).summary_json?.snippet 
          || '';
      }
      ```
    - If snippet is empty after all fallbacks, log to `agent_activity_log` with thread ID and available keys (defensive "Key Dumper"):
      ```typescript
      if (!snippet) {
        await supabase.from('agent_activity_log').insert({
          organization_id,
          agent_id: 'email-triage',
          action_taken: 'snippet_extraction_failed',
          reasoning_trace: {
            thread_id: thread.id,
            available_keys: thread.metadata ? Object.keys(thread.metadata) : 'metadata_is_null',
            thread_structure_sample: JSON.stringify(thread).substring(0, 500)
          }
        });
      }
      ```
    - **Safety**: Wrap the `agent_activity_log` insert in its own try/catch to prevent silent failures if DB is down.

### 4. Fix Morning Brief Processor
- [x] **Task 4: Fix Types and Null Checks**
  - **File**: `apps/agent/src/processors/MorningBriefProcessor.ts`
  - **Action**:
    - Fix `last_brief_generated_at` access by updating TypeScript types first (see Task 5).
    - Add explicit null checks before accessing `threads` array properties:
      ```typescript
      if (!threads || threads.length === 0) {
        return { message: "No threads found", success: true, brief_generated: false };
      }
      ```
    - Ensure `organization_id` is passed correctly to all `supabase` calls (verify via code review).

- [x] **Task 5: Update TypeScript Types**
  - **File**: `packages/shared/src/types/database.ts` (or equivalent type definition file)
  - **Action**:
    - Add `metadata?: { actionable_items?: any[] }` to `MorningBrief` interface.
    - Add `last_brief_generated_at?: string` to `Profile` interface.
    - Run type check: `pnpm typecheck` or `tsc --noEmit` to verify.

### 5. Automated Testing
- [x] **Task 6: Unit Tests for Snippet Extraction**
  - **File**: Create `apps/agent/src/processors/EmailTriageProcessor.test.ts`
  - **Action**:
    - Test `extractSnippet` function with various thread structures:
      - Thread with `metadata.snippet`
      - Thread with `body` property
      - Thread with empty metadata
      - Thread with null metadata

- [x] **Task 7: Integration Test for MCP Connection**
  - **File**: Create or update `apps/agent/src/services/mcp.test.ts`
  - **Action**:
    - Mock `SSEClientTransport` to simulate 400 error and verify error logging captures full details.
    - Verify `transport.onerror` is bound before `connect()`.

## Acceptance Criteria

- [ ] **AC 1: Database Migration Success**
  - Given the migration file is created with proper sequential numbering, When `supabase db push` or migration apply is run, Then `morning_briefs` has a `metadata` column with GIN index and `profiles` has `last_brief_generated_at` with B-tree index.
- [ ] **AC 2: Migration Rollback Works**
  - Given migration is applied, When `supabase db reset` or down migration runs, Then columns and indexes are cleanly removed without data corruption.
- [ ] **AC 3: Triage Has Content**
  - Given an unclassified thread, When `EmailTriageProcessor` runs, Then the prompt sent to the LLM contains a non-empty `EMAIL SNIPPET` extracted from the correct path.
- [ ] **AC 4: Morning Brief Completes**
  - Given processed threads exist, When `MorningBriefProcessor` runs, Then it successfully inserts a row into `morning_briefs` without a "column not found" error.
- [ ] **AC 5: MCP Error Diagnosis**
  - Given the MCP server returns 400, When the agent connects, Then BOTH console logs AND `agent_activity_log` contain the full error body (e.g., "Invalid Scope", "Bad Request: ...").
- [ ] **AC 6: TypeScript Types Synced**
  - Given schema changes are applied, When `tsc --noEmit` runs, Then no type errors exist for `last_brief_generated_at` or `metadata` accesses.
- [ ] **AC 7: Tests Pass**
  - Given test suite runs, When `pnpm test` executes, Then all new tests for snippet extraction and MCP error handling pass.

## Dependencies
- Supabase CLI (for applying migrations)
- Access to the `workspace-mcp` logs (handled via `spawn` stdout in `mcp.ts` already)
- Verify `supabase/migrations/` directory exists: `ls supabase/migrations`

## Testing Strategy
- **Unit**: Run `pnpm test` for snippet extraction logic (Task 6).
- **Integration**: Run `pnpm test:integration` for MCP connection error handling (Task 7).
- **Manual**: Trigger the workflow for a specific user/org and watch the logs.
- **Verification**: Check Supabase dashboard to verify schema changes and indexes.
- **Type Check**: Run `pnpm typecheck` before committing.

## Notes & Risks
- **Risk**: If `agent_activity_log` insert fails during error handling, the original error context may be lost. **Mitigation**: Always log to console first, then attempt DB persistence.
- **Risk**: JSONB columns without indexes can cause performance issues on large tables. **Mitigation**: GIN index added in Task 1.
- **Risk**: Migration filename conflicts if not using proper sequencing. **Mitigation**: Check existing migrations first, use `ls supabase/migrations | sort | tail -5` to see latest.
