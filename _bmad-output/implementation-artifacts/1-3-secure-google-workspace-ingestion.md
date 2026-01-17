# Story 1.3: Secure Google Workspace Ingestion

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an SME Leader,
I want to securely connect my Google Workspace account using my existing login,
so that the assistant can access my calendar and email data to populate my morning brief.

## Acceptance Criteria

1. **Supabase Google OAuth2 Integration**: Implement the Google sign-in flow using `supabase.auth.signInWithOAuth` that:
   - Requests 'offline' access via `queryParams: { access_type: 'offline', prompt: 'consent' }` to ensure a refresh token is returned.
   - Includes restricted readonly scopes: `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/calendar.readonly`, and `https://www.googleapis.com/auth/drive.readonly`.
2. **Provider Token Capture & Encryption**: Implement a mechanism in the Agent/Backend that:
   - Captures the Google `provider_token` (access token) and `provider_refresh_token` from the session.
   - **Security**: Immediately sends tokens to the secure Agent encryption endpoint; do NOT persist them in client-side storage beyond the initial handshake.
   - Encrypts these tokens using a server-side secret (Node.js `crypto` AES-256-GCM) before storage.
   - Saves the encrypted tokens to the `workspace_integrations` table, linked to the `organization_id`.
3. **Background Ingestion Service**: The Agent Controller (Node.js) must:
   - Periodically (e.g., every 15-30 minutes) retrieve and decrypt refresh tokens for active organizations.
   - Use the `googleapis` library to fetch recent Gmail threads (`gmail.threads.list`) and Calendar events (`calendar.events.list`).
   - Populate the `ingested_threads` and `calendar_events` tables with metadata (subject, snippet, external_id, date).
4. **Security Isolation**: Ensure all database writes for ingested data respect Row Level Security (RLS) to maintain multi-tenant isolation.
5. **Least Privilege**: Verify that no "write" scopes are requested during this phase to maintain executive trust.

## Tasks / Subtasks

- [x] **Supabase & Google Cloud Config**
  - [x] Enable Google Provider in Supabase and configure restricted scopes.
  - [x] Set up Google Cloud OAuth client with correct redirect URIs.
- [x] **Frontend Integration (Hub)**
  - [x] Implement `signInWithGoogle` in `apps/web/src/composables/useAuth.ts`.
  - [x] Create simple "Connect Workspace" UI in the dashboard/settings.
- [x] **Token Management (Agent/Backend)**
  - [x] Implement encryption/decryption utility in `packages/shared/src/utils/encryption.ts`.
  - [x] Create service in `apps/agent` to securely receive and store tokens in `workspace_integrations`.
- [x] **Ingestion Engine (Agent)**
  - [x] Implement `GoogleIngestionService` in `apps/agent/src/services/google.ts`.
  - [x] **Database**: Create `calendar_events` table with `org_id` and RLS (matches `ingested_threads` pattern).
  - [x] Logic to fetch Gmail thread metadata and upsert into `ingested_threads`.
  - [x] Logic to fetch Calendar events and upsert into `calendar_events`.
  - [x] **Scheduler**: Implement basic periodic polling (15-30 min interval) for ingestion.
- [x] **RLS Verification**
  - [x] Verify that the Agent (using `service_role`) correctly sets `organization_id` so that the UI can see the data via RLS.

## Dev Notes

- **Supabase Auth**: Use PKCE flow if possible (`flowType: 'pkce'`).
- **Token Persistence**: Remember that Supabase only returns the `provider_refresh_token` when `prompt: 'consent'` is used. The UI must handle the case where a user needs to "Reconnect" to refresh the token.
- **Direct API**: Use `googleapis` package for Node.js.
- **Note on MCP**: Deep reasoning and action execution via the Google Workspace MCP server is deferred to a later "Agent Execution" story.

### Project Structure Notes

- **Frontend**: `apps/web/src/composables/useAuth.ts`
- **Agent Service**: `apps/agent/src/services/google.ts`
- **Shared Utilities**: `packages/shared/src/utils/encryption.ts`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture]
- [Supabase Docs: Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Google API Node.js Client](https://github.com/googleapis/google-api-nodejs-client)

## Dev Agent Record

### Agent Model Used

Bob (Technical Scrum Master) - Ultimate Story Context Engine

### Completion Notes List

- Implemented AES-256-GCM encryption/decryption in `@ai-assistant/shared`.
- Created `calendar_events` table in Supabase with RLS.
- Implemented `GoogleIngestionService` for Gmail and Calendar syncing.
- Implemented `useAuth` composable with Google OAuth and token relay to Agent.
- Wired Agent Controller to run periodic ingestion every 15 minutes.
- Verified RLS and multi-tenant isolation.
- Applied CRITICAL FIX: Added missing `calendar_events` table and RLS policies to migrations.
- Refactored `useAuth` to use `VITE_AGENT_URL` environment variable.
- Improved secret validation in Agent Controller.

### File List

- `_bmad-output/implementation-artifacts/1-3-secure-google-workspace-ingestion.md`
- `packages/shared/src/utils/encryption.ts`
- `packages/shared/tests/encryption.spec.ts`
- `apps/agent/src/services/google.ts`
- `apps/agent/src/services/google.spec.ts`
- `apps/agent/src/services/tokenService.ts`
- `apps/agent/src/index.ts`
- `apps/web/src/composables/useAuth.ts`
- `supabase/migrations/<auto-applied>`
