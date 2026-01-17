# Story 2.3: MCP SDK Integration with Google Workspace Server

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Developer,
I want the Agent Controller to communicate with the Google Workspace MCP Server via the MCP SDK,
so that it can read emails, manage calendar events, and access Google Docs programmatically using standardized tool calls.

## Acceptance Criteria

1. [x] **Service Implementation**: A new `MCPService.ts` is created in `apps/agent/src/services/` that wraps the `@modelcontextprotocol/sdk`.
2. [x] **Subprocess Management**: The service can spawn the Python-based Google Workspace MCP Server (`https://github.com/taylorwilsdon/google_workspace_mcp`) as a subprocess using `stdio` transport.
3. [x] **Standard Interface**: The service provides a clean interface for calling MCP tools provided by the server (e.g., `gmail.list_messages`, `gmail.get_thread`, `calendar.create_event`, `drive.search_files`).
4. [x] **Authentication Passthrough**: The service correctly passes organization-specific Google credentials (tokens) to the MCP server environment variables or session context.
5. [x] **Resource Access**: The service can read MCP resources (e.g., specific email thread content) as requested by processors.
6. [x] **Error Handling**: Proper handling of MCP server crashes, timeouts, and tool execution errors with logging to `agent_activity_log`.

## Tasks / Subtasks

- [x] **Infrastructure Setup**
  - [x] Install `@modelcontextprotocol/sdk` in `apps/agent`.
  - [x] Clone or install the Google Workspace MCP server from `https://github.com/taylorwilsdon/google_workspace_mcp`.
  - [x] Verify local Python environment (version 3.10+) has `uv` or `pip` to run the server.
- [x] **Core MCP Service**
  - [x] Implement `MCPService` class in `apps/agent/src/services/mcp.ts`.
  - [x] Implement subprocess spawning with `uvx workspace-mcp` or `python main.py`.
  - [x] Implement `executeTool(orgId, toolName, arguments)` method using the SDK client.
  - [x] Implement tool tier configuration (default to `complete` to ensure all functionality is available).
- [x] **Security & Perimeter**
  - [x] Ensure `MCPService` output passes through `PerimeterGuard` before returning to the calling node.
- [x] **Integration**
  - [x] Update `EmailDraftProcessor` and `CalendarCreateProcessor` to use `MCPService` instead of stubs.
- [x] **Testing**
  - [x] Add unit tests for `MCPService` using mocks for the subprocess/stdio.
  - [x] Integration test: Verify the service can successfully list tools from the MCP server.

## Dev Notes

### Technical Stack
- **Library**: `@modelcontextprotocol/sdk` (Node.js)
- **Transport**: `StdioClientTransport`
- **MCP Server**: [google_workspace_mcp](https://github.com/taylorwilsdon/google_workspace_mcp) (Python)
- **Execution**: `uvx --from google-workspace-mcp google-workspace-worker`.

### Architecture Compliance
- **File Structure**: `apps/agent/src/services/mcp.ts`
- **Pattern**: Asynchronous tool execution with structured logging.
- **Audit Requirement**: Every MCP call must log a "Reasoning Trace" step to `agent_activity_log`.

### Project Structure Notes
- The `google_workspace_mcp` server provides comprehensive coverage for Gmail, Calendar, Drive, Docs, Sheets, and more.
- We should utilize the `complete` tool tier (`--tool-tier complete`) to expose all capabilities to the Agent Controller.
- Shared types from `packages/shared` should be used for any new data contracts.
- **Actual Tool Names Found**:
  - `create_gmail_draft`
  - `create_calendar_event`
  - `query_gmail_emails`

### References
- [Source: https://github.com/taylorwilsdon/google_workspace_mcp]
- [Source: _bmad-output/planning-artifacts/architecture.md#Infrastructure & Deployment]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3]

---

## Dev Agent Record

### Agent Model Used
Antigravity (Claude 3.5 Sonnet)

### Implementation Plan
- Installed MCP SDK and Google Workspace MCP server via `uv`.
- Created `MCPService` with `StdioClientTransport` using `uvx`.
- Integrated `PerimeterGuard` for redaction of MCP tool results.
- Logged all MCP tool calls and errors to `agent_activity_log`.
- Updated `EmailDraftProcessor` and `CalendarCreateProcessor` to use the new service.

### Debug Log
- Encountered Vitest mock issues with `Client` constructor; fixed by using regular function instead of arrow function in `vi.mock`.
- Verified MCP server tool names via a spawn test script; corrected tool names in processors.
- Added missing integration tests and processor tests identified during code review.
- Refactored `MCPService` to support client caching and connection reuse per organization.

### Completion Notes List
- Integrated specific MCP server implementation details from `taylorwilsdon/google_workspace_mcp`.
- Mapped tool-call patterns to existing `domain.action` routing logic.
- Identified requirement for Python 3.10+ in the agent execution environment.
- ✅ Unit tests pass 100%.
- ✅ Integration test (listing tools) confirmed server connectivity.

## File List
- `apps/agent/src/services/mcp.ts` (New)
- `apps/agent/src/services/mcp.spec.ts` (New)
- `apps/agent/src/services/mcp.integration.spec.ts` (New)
- `apps/agent/src/processors/EmailDraftProcessor.ts` (Modified)
- `apps/agent/src/processors/EmailDraftProcessor.spec.ts` (New)
- `apps/agent/src/processors/CalendarCreateProcessor.ts` (Modified)
- `apps/agent/src/processors/CalendarCreateProcessor.spec.ts` (New)

## Change Log
- 2026-01-17: Initial implementation of MCP Service and integration with processors.
- 2026-01-17: Added comprehensive test suite (unit + integration + processor tests) following code review.
- 2026-01-17: Implemented client caching and connection reuse to improve performance.
