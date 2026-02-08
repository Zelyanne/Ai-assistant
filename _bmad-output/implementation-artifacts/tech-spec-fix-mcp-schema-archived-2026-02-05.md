---
title: 'Fix MCP Connection and Task Schema'
slug: 'fix-mcp-schema'
created: '2026-02-05'
status: 'in-progress'
stepsCompleted: [1, 2]
tech_stack: ['Node.js', 'Typescript', 'Supabase', 'MCP SDK']
files_to_modify: ['apps/agent/src/services/mcp.ts', 'apps/agent/src/processors/MorningBriefProcessor.ts']
code_patterns: ['Use Web Standard Headers API for MCP Client', 'Ensure DB Schema matches Typescript Interfaces', 'Dual-mode headers for EventSource']
test_patterns: ['Vitest', 'Mocking MCP ClientTransport']
---

# Overview

## Problem Statement
The agent is experiencing critical failures during startup and task processing:
1. **MCP Connection Failure**: connecting to the MCP server fails with a 400 error. The `SSEClientTransport` appears to use an `EventSource` implementation that requires headers in `eventSourceInit` (as a plain object) rather than `requestInit` (as a Headers object), or vice versa.
2. **Schema Mismatch**: The `tasks` table is missing the `topic` column, causing database errors during task creation.
3. **Tracing Instability**: `tracingService` is reported as undefined, likely a secondary symptom of startup race conditions or cyclic dependencies.
4. **Morning Brief Enum Error**: The LLM output for priority was returning numeric fractions instead of valid enum values ('high', 'medium', 'low').

## Solution
1. **Refactor MCP Client**: Update `mcp.ts` to pass Authorization headers in **both** `requestInit` (as `Headers`) and `eventSourceInit` (as plain object) to ensure compatibility with the underlying `eventsource` library.
2. **Schema Migration**: Add `topic` column to `tasks` table.
3. **Hardening**: Add null checks for `user_id` in token refresh logic.
4. **Prompt Engineering**: Update `MorningBriefProcessor` prompt to explicitly forbid numeric priority scores.

## Scope
- `apps/agent/src/services/mcp.ts`
- `apps/agent/src/processors/MorningBriefProcessor.ts`
- Database Schema (`tasks` table)

## Context for Development

### Codebase Patterns
- **MCP Client**: The project uses the `@modelcontextprotocol/sdk`. The underlying `eventsource` library behavior regarding `fetch` overrides vs `eventSourceInit` headers is ambiguous, so we support both.
- **Database**: Supabase is used for persistence.
- **Agentic**: `MorningBriefProcessor` uses an LLM agent for synthesis.

### Technical Decisions
- **Dual Headers**: To fix the 400 error definitively, we inject the Bearer token into every possible configuration slot (`requestInit` and `eventSourceInit`).
- **Prompt Guardrails**: Added "CRITICAL" instructions to the morning brief prompt to enforce enum constraints.
