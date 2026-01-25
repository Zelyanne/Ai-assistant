# Story 1.5: PerimeterGuard PII Redaction Service

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Privacy Officer,
I want PII to be masked before it is sent to external LLMs,
so that we maintain executive trust and SOC2 compliance (NFR3).

## Acceptance Criteria

1.  **PerimeterGuard Utility Implementation**:
    *   Create `apps/agent/src/guards/PerimeterGuard.ts`.
    *   Implement a `redactPII(text: string): string` function that identifies and replaces sensitive data with semantic placeholders.
    *   **Required Redaction Entities**:
        *   **Person Names**: e.g., "John Doe" -> `[NAME_1]`
        *   **Phone Numbers**: e.g., "+1-555-0199" -> `[PHONE_1]`
        *   **Email Addresses**: e.g., "alexis@example.com" -> `[EMAIL_1]`
        *   **Physical Addresses**: Street, City, Zip codes.
        *   **Sensitive IDs**: Credit Card numbers, Social Security numbers, Passport IDs.
    *   **Placeholders**: Must be deterministic within a single session (same PII gets same placeholder) to preserve LLM reasoning logic.

2.  **Reasoning Loop Integration**:
    *   Integrate the utility into the `AgencyController.ts` (or the core LLM request service).
    *   Ensure all data fetched from Google Workspace (emails, calendar events, docs) is redacted before being bundled into an LLM prompt.

3.  **Audit & Verification**:
    *   Log the occurrence of redaction (count of entities replaced) to the `agent_activity_log` table.
    *   Do NOT store original PII in the logs.

4.  **Testing Standards**:
    *   Unit tests in `apps/agent/src/guards/PerimeterGuard.spec.ts`.
    *   Tests must verify that redaction does not break the grammar or logical coherence of the sentence (e.g., "Meeting with John at 5pm" becomes "Meeting with [NAME_1] at 5pm").

## Tasks / Subtasks

- [x] **Core Utility (`apps/agent`)**
    - [x] Research and select a lightweight PII masking library (e.g., `maskdata` or `pii-filter`) or implement robust regex-based patterns.
    - [x] Create `PerimeterGuard.ts` and implement the redaction logic.
    - [x] Implement semantic placeholder mapping to ensure consistency.
- [x] **Integration (`apps/agent`)**
    - [x] Wrap the LLM client call with the `PerimeterGuard` redaction layer.
    - [x] Ensure the redaction happens *after* context gathering but *before* tokenization/sending to API.
- [x] **Observability & Quality**
    - [x] Add redaction telemetry to the activity logs.
    - [x] Verify zero-leakage of raw PII to external endpoints (mocking the LLM provider).

## Dev Notes

- **Library Recommendation**: Use `maskdata` for a quick, regex-heavy Node.js implementation, or `pii-filter` for more advanced pattern matching.
- **Performance**: Redaction must be fast (<100ms for typical email bodies) to meet NFR9.
- **Coherence**: This is CRITICAL. If you redact "The project is called Apollo" as "[NAME_1]", the AI might lose track of the project name. Only redact *Personally Identifiable Information*, not business entities unless they are personal names.
- **Previous Story Residue (Action Required)**: LSP errors were detected in `apps/web/src/stores/user.ts` regarding missing `Profile` export in `@ai-assistant/shared`. While out of scope for the PII logic, ensure your changes to `packages/shared` (if any) do not exacerbate this, and consider fixing it if you touch the shared schemas.

### Project Structure Notes

- **Perimeter Guard**: `apps/agent/src/guards/PerimeterGuard.ts`
- **Controller**: `apps/agent/src/controller/AgencyController.ts`
- **Shared Types**: `packages/shared/src/schemas.ts` and `packages/shared/src/database.types.ts`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Infrastructure & Deployment]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR3]
- [Context7: /microsoft/presidio] (For pattern inspiration, though using a JS native library for implementation)

## Dev Agent Record

### Agent Model Used

Amelia (Developer Agent)

### Completion Notes List

- Implemented `PerimeterGuard` with regex-based redaction for Names, Phones, Emails, Addresses, and Sensitive IDs.
- Integrated `PerimeterGuard` into `AgencyController` to redact prompts before LLM calls.
- Added telemetry logging to `agent_activity_log` for redaction events.
- Verified implementation with comprehensive unit tests in `PerimeterGuard.spec.ts` and `AgencyController.spec.ts`.
- Fixed `Mistral` mock in `AgencyController.spec.ts` to correctly handle constructor calls.

### Adversarial Code Review (Agent: Antigravity)
- **Status**: PASSED after automated fixes
- **Critical Issues Fixed**:
  - **Memory Leak**: Refactored `AgencyController` to instantiate `PerimeterGuard` per-request instead of holding a long-lived stateful instance.
  - **Security Bypass**: Fixed regex logic to correctly redact "John Doe" (space handling) and "Tell John" (context handling).
  - **Audit Integrity**: Added strict error throwing if audit logging fails (NFR compliance).
- **Test Coverage**: Added robust test cases for single names and recovery.
- **Note**: Git history was missing (process violation), fixes applied directly to files.

### File List

- `_bmad-output/implementation-artifacts/1-5-perimeterguard-pii-redaction-service.md`
- `apps/agent/src/guards/PerimeterGuard.ts`
- `apps/agent/src/guards/PerimeterGuard.spec.ts`
- `apps/agent/src/controller/AgencyController.ts`
- `apps/agent/src/controller/AgencyController.spec.ts`
