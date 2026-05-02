---
title: 'LangGraph Multi-Agent Architecture Refactor'
slug: 'langgraph-multi-agent-refactor'
created: '2026-03-23T00:00:00.000Z'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['LangGraph', 'LangChain', 'TypeScript', 'MistralAI', 'Zod', 'Vitest', 'Supabase', 'Google MCP Tools']
files_to_modify: ['apps/agent/src/controller/graph.ts', 'apps/agent/src/controller/nodes/planner.ts', 'apps/agent/src/controller/nodes/reasoning.ts', 'apps/agent/src/workers/WorkspaceWorkerAgent.ts', 'apps/agent/src/workers/CapabilityWorkerRegistry.ts', 'apps/agent/src/processors/AssistantCommandProcessor.ts', 'apps/agent/src/processors/assistant-command/CommandPlanningAgent.ts']
code_patterns: ['LangGraph StateGraph with Annotation for state types', 'LangChain createAgent with DynamicStructuredTool', 'Workspace agent specialization pattern (tool specs per worker type)', 'Execution plan with step tracking (pending → in_progress → completed)', 'Tool tracking via invocations array for audit logging', 'Worker summary building for agent handoff notes']
test_patterns: ['Vitest unit tests with *.spec.ts files', 'Mock implementations for external services', 'Integration tests for agent handoff flows']
---

# Tech-Spec: LangGraph Multi-Agent Architecture Refactor

**Created:** 2026-03-23

## Overview

### Problem Statement

The current LangGraph implementation has planning and worker logic but lacks proper node separation, router orchestration, time-aware planning, and clean agent-to-agent handoff patterns. Specifically:
- No dedicated General Agent node with system prompt about capabilities and awareness of other agents
- Planner lacks a time/date tool to calculate relative dates like "tomorrow"
- No explicit Router node that routes between specialist agents based on task status
- Specialist agents exist but aren't structured as proper LangGraph nodes with optimized system prompts
- Manual parsing in some places instead of letting LangChain's `createAgent` handle tools natively
- No clean handoff flow: Planner → Router → Specialist → Summary → Task Status Update → Router → General Agent

### Solution

Refactor into a clean multi-agent LangGraph architecture with:
1. **General Agent Node** - User-facing, plans tasks, aware of all specialist capabilities, has time/date tool
2. **Router Node** - Routes tasks between specialists based on plan step and task status
3. **Specialist Agent Nodes** (Gmail, Calendar, Docs, Sheets, Slides) - Each with optimized system prompts and native LangChain tool handling
4. **Time/Date Tool** - For the planner to calculate relative dates (e.g., "tomorrow" → "2026-03-24")
5. **Clean handoff flow** with task status tracking between nodes

### Scope

**In Scope:**
- Create new node files: `generalAgent.ts`, `router.ts`
- Refactor `WorkspaceWorkerAgent.ts` into separate specialist node files
- Add `timeDateTool.ts` utility for relative date calculations
- Update system prompts for all agents with clear capability awareness
- Fix tool handling to use LangChain native `createAgent` approach (remove manual parsing)
- Implement proper task status flow between nodes (pending → in_progress → completed)
- Update `graph.ts` to wire new nodes into the LangGraph StateGraph
- Update `planner.ts` to use time/date tool and produce cleaner execution plans

**Out of Scope:**
- Changing the underlying Google API integrations (MCP service layer)
- Modifying the ExecutionRunService schema
- Changing the Task/ExecutionRun data models
- Modifying processor files (EmailDraftProcessor, EmailSendProcessor, etc.)

## Context for Development

### Codebase Patterns

**Current Architecture:**
- LangGraph StateGraph in `graph.ts` with nodes for reasoning, memory, planner, workers
- `CapabilityWorkerRegistry` delegates to `executeWorkspaceWorkerAgent`
- `WorkspaceWorkerAgent` builds tool specs per worker type (gmail, calendar, docs, sheets, slides, drive)
- Each worker type has a `systemPrompt` and `buildToolSpecs` function
- Tools are wrapped with `createTrackedTool` and passed to LangChain's `createAgent`

**Patterns to Preserve:**
- Tool tracking via `invocations` array for audit logging
- `buildWorkerSummary` for consistent handoff notes between agents
- `ExecutionRunService` for step-by-step plan execution tracking
- MCP service for actual Google API tool execution

**Patterns to Fix:**
- Remove manual tool argument parsing (let LangChain handle it)
- Make each specialist a proper LangGraph node (not just a function)
- Add explicit Router node for inter-agent routing
- Add General Agent node as the user-facing entry point

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/agent/src/controller/graph.ts` | Main LangGraph StateGraph definition - needs new nodes wired |
| `apps/agent/src/controller/nodes/planner.ts` | Planner node - needs time/date tool, cleaner plan output |
| `apps/agent/src/workers/WorkspaceWorkerAgent.ts` | Current worker agent - split into specialist nodes |
| `apps/agent/src/workers/CapabilityWorkerRegistry.ts` | Worker registry - refactor for router pattern |
| `apps/agent/src/processors/AssistantCommandProcessor.ts` | Command parsing - may need updates for new flow |
| `apps/agent/src/processors/assistant-command/CommandPlanningAgent.ts` | Planning agent - update system prompt |
| `apps/agent/src/services/mcp.ts` | MCP service - tool execution layer (preserve) |
| `apps/agent/src/services/ExecutionRunService.ts` | Execution tracking (preserve) |

### Technical Decisions

1. **Node Granularity**: Each specialist (Gmail, Calendar, Docs, Sheets, Slides) becomes its own node file for clarity and independent testing
2. **Router Pattern**: Router node reads `execution_run.plan_json` and routes to the appropriate specialist based on `current_step.worker_type`
3. **Time/Date Tool**: Implemented as a pure utility function injected into planner's tool set
4. **System Prompts**: Each agent gets a system prompt that explicitly states:
   - Its role and capabilities
   - What other agents exist and their capabilities
   - How to hand off to other agents
5. **LangChain Native Tools**: Remove manual argument parsing, let `DynamicStructuredTool` schemas handle validation
6. **Task Status Flow**: Use `ExecutionRunService` to track step status, Router reads this to determine next action

### Architecture Decision Records

#### ADR-001: Router Node Pattern
- **Status:** Accepted
- **Decision:** Use dedicated Router node instead of conditional edges
- **Rationale:** Enables clean handoff logic, routing-specific audit logging, dedicated system prompt
- **Trade-off:** More code vs. cleaner architecture
- **Safety:** Add fallback path to General Agent on router failures

#### ADR-002: Separate Specialist Nodes
- **Status:** Accepted
- **Decision:** Create separate node files for each specialist (Gmail, Calendar, Docs, Sheets, Slides)
- **Rationale:** Existing WorkerAgent is 779 lines; splitting improves maintainability, testability, rollback safety
- **Trade-off:** More files vs. cleaner SRP
- **Safety:** Keep imports organized, use barrel export pattern

#### ADR-003: Time/Date Tool as LangChain Tool
- **Status:** Accepted
- **Decision:** Wrap time/date functions as DynamicStructuredTool
- **Rationale:** Planner can call naturally, audit logging enabled, schema validation
- **Trade-off:** More code vs. natural agent invocation
- **Safety:** Underlying implementation remains pure functions

#### ADR-004: Centralized System Prompts
- **Status:** Accepted
- **Decision:** Centralize all agent system prompts in specialistPrompts.ts
- **Rationale:** Consistency, easy updates, single security review point
- **Trade-off:** Extra file vs. easier maintenance

#### ADR-005: Fallback Compatibility Pattern
- **Status:** Accepted
- **Decision:** New specialist nodes are primary, old WorkerAgent is fallback
- **Rationale:** Gradual migration with safety net, zero risk of breaking existing flows
- **Trade-off:** Complexity vs. safety
- **Safety:** Plan to deprecate old WorkerAgent after 2-3 successful production runs

## Implementation Plan

### Tasks

- [ ] Task 1: Create Time/Date Utility Tool
  - File: `apps/agent/src/tools/timeDateTool.ts`
  - Action: Create new file with functions for relative date parsing and timezone conversion
  - Notes: Pure utility functions - parseRelativeDate("tomorrow", timezone) → ISO string, formatDateTime(date, format) → string

- [ ] Task 2: Create Specialist System Prompts
  - File: `apps/agent/src/prompts/specialistPrompts.ts`
  - Action: Create centralized system prompts for all 6 agents (General, Gmail, Calendar, Docs, Sheets, Slides)
  - Notes: Each prompt lists own capabilities, other agents, and handoff instructions

- [ ] Task 3: Create Gmail Specialist Node
  - File: `apps/agent/src/controller/nodes/gmailAgent.ts`
  - Action: Extract Gmail logic from WorkspaceWorkerAgent into dedicated node
  - Notes: Use DynamicStructuredTool with native schemas, remove manual argument parsing, return handoff note with draft/send status

- [ ] Task 4: Create Calendar Specialist Node
  - File: `apps/agent/src/controller/nodes/calendarAgent.ts`
  - Action: Extract Calendar logic from WorkspaceWorkerAgent into dedicated node
  - Notes: Use DynamicStructuredTool with native schemas, return handoff note with event ID and timing details

- [ ] Task 5: Create Docs Specialist Node
  - File: `apps/agent/src/controller/nodes/docsAgent.ts`
  - Action: Extract Docs logic from WorkspaceWorkerAgent into dedicated node
  - Notes: Use DynamicStructuredTool with native schemas, return handoff note with document URL and content summary

- [ ] Task 6: Create Sheets Specialist Node
  - File: `apps/agent/src/controller/nodes/sheetsAgent.ts`
  - Action: Extract Sheets logic from WorkspaceWorkerAgent into dedicated node
  - Notes: Use DynamicStructuredTool with native schemas, return handoff note with spreadsheet URL and data written

- [ ] Task 7: Create Slides Specialist Node
  - File: `apps/agent/src/controller/nodes/slidesAgent.ts`
  - Action: Extract Slides logic from WorkspaceWorkerAgent into dedicated node
  - Notes: Use DynamicStructuredTool with native schemas, return handoff note with presentation URL and slide structure

- [ ] Task 8: Create General Agent Node
  - File: `apps/agent/src/controller/nodes/generalAgent.ts`
  - Action: Create new General Agent that receives user requests, uses time/date tool, produces execution plans
  - Notes: Has access to timeDateTool, aware of all specialist capabilities, outputs structured execution plan

- [ ] Task 9: Create Router Node
  - File: `apps/agent/src/controller/nodes/router.ts`
  - Action: Create Router that reads execution plan, routes to specialist based on current step worker_type
  - Notes: Reads ExecutionRunService for step status, routes to next pending step or returns to General Agent

- [ ] Task 10: Update Planner Node
  - File: `apps/agent/src/controller/nodes/planner.ts`
  - Action: Inject timeDateTool into planner's tool set, update system prompt for capability awareness
  - Notes: Planner should call timeDateTool when parsing relative dates in user requests

- [ ] Task 11: Update Graph.ts with New Nodes
  - File: `apps/agent/src/controller/graph.ts`
  - Action: Wire new nodes (GeneralAgent, Router, GmailAgent, CalendarAgent, DocsAgent, SheetsAgent, SlidesAgent) into StateGraph
  - Notes: Add node definitions, update edge routing to use Router node, preserve existing node names for backward compatibility

- [ ] Task 12: Update CommandPlanningAgent System Prompt
  - File: `apps/agent/src/processors/assistant-command/CommandPlanningAgent.ts`
  - Action: Update buildPlannerSystemPrompt to include capability awareness and time/date tool usage instructions
  - Notes: Planner should be aware of all specialist capabilities and produce cleaner execution plans

- [ ] Task 13: Deprecate Old WorkspaceWorkerAgent
  - File: `apps/agent/src/workers/WorkspaceWorkerAgent.ts`
  - Action: Mark as deprecated, update exports to point to new specialist nodes
  - Notes: Keep for backward compatibility but remove from active use

- [ ] Task 14: Update CapabilityWorkerRegistry
  - File: `apps/agent/src/workers/CapabilityWorkerRegistry.ts`
  - Action: Refactor to use Router node instead of direct workspace worker delegation
  - Notes: Router should handle routing logic, registry should just pass execution context

- [ ] Task 15: Write Unit Tests for Time/Date Tool
  - File: `apps/agent/src/tools/timeDateTool.spec.ts`
  - Action: Test relative date parsing, timezone conversion, date formatting
  - Notes: Cover edge cases: "tomorrow", "next week", "in 3 days", invalid inputs

- [ ] Task 16: Write Unit Tests for Specialist Nodes
  - File: `apps/agent/src/controller/nodes/*.spec.ts`
  - Action: Test each specialist node independently with mocked MCP services
  - Notes: Test system prompt generation, tool spec building, handoff note format

- [ ] Task 17: Write Integration Tests for Router
  - File: `apps/agent/src/controller/nodes/router.spec.ts`
  - Action: Test router node routing logic with mocked ExecutionRunService
  - Notes: Test single-step routing, multi-step routing, task completion detection

- [ ] Task 18: Write Integration Tests for Full Flow
  - File: `apps/agent/src/controller/graph.spec.ts`
  - Action: Test end-to-end flow from General Agent → Router → Specialist → Router → General Agent
  - Notes: Test multi-step plans, error handling, handoff note propagation

- [ ] Task 19: Add Fallback Logic to Router Node
  - File: `apps/agent/src/controller/nodes/router.ts`
  - Action: If specialist node doesn't exist or fails, fallback to old WorkerAgent
  - Notes: Check node existence in graph, catch specialist failures, route to fallback. Plan to deprecate after 2-3 successful production runs.

- [ ] Task 20: Add Router Validation and Audit Logging
  - File: `apps/agent/src/controller/nodes/router.ts`
  - Action: Add validation before routing, audit logging for all routing decisions, timeout safety
  - Notes: Verify specialist can handle step, log routing reason, fallback if > 2 seconds

- [ ] Task 21: Add Date Validation to Time/Date Tool
  - File: `apps/agent/src/tools/timeDateTool.ts`
  - Action: Add validation for date ranges, format, timezone, human-readable confirmation
  - Notes: Reject dates > 1 year future or < 1 day past, ensure ISO-8601, validate IANA timezone

- [ ] Task 22: Add Schema Error Handling to All Specialist Nodes
  - File: `apps/agent/src/controller/nodes/{specialist}Agent.ts`
  - Action: Add try-catch for schema validation errors, return clear error messages
  - Notes: Catch validation failures, return user-friendly error, limit retries to 3

- [ ] Task 23: Add Handoff Note Validation
  - File: `apps/agent/src/controller/nodes/router.ts`
  - Action: Validate handoff note schema, size, and sanitization before passing to next agent
  - Notes: Validate JSON, truncate to 1000 chars, escape control characters

- [ ] Task 24: Add Intent Clarification Logic
  - File: `apps/agent/src/controller/nodes/generalAgent.ts`
  - Action: Add confidence scoring and clarification prompts for ambiguous requests
  - Notes: If confidence < 80%, ask user for clarification instead of routing

### Acceptance Criteria

- [ ] AC 1: Given a user request like "put a reminder for tomorrow on my calendar", when the General Agent receives the request, then it should have access to a time/date tool to calculate "tomorrow" as a specific date, and it should produce an execution plan with the correct date

- [ ] AC 2: Given an execution plan with multiple steps (e.g., Calendar → Gmail → Docs), when the Router node processes the plan, then it should route to the correct specialist node based on current_step.worker_type, and it should update task status appropriately between steps

- [ ] AC 3: Given a specialist agent (e.g., Calendar) receives a task, when the agent executes, then tools should be handled natively by LangChain's createAgent, and there should be no manual argument parsing in the specialist code

- [ ] AC 4: Given any specialist agent, when inspecting its system prompt, then it should list its own capabilities, it should list other agents and their capabilities, and it should describe how to hand off to other agents

- [ ] AC 5: Given a multi-step task (Calendar → Gmail), when the Calendar step completes, then the task status should be updated to reflect step completion, the Router should proceed to the Gmail step, and the final response should include summaries from both steps

- [ ] AC 6: Given a specialist completes its work, when it produces output, then the output should include a handoff_content field, and the next agent should receive this in its context

- [ ] AC 7: Given the Calendar specialist node, when calling manage_event tool with action "create", then the tool schema should validate the input natively (not via manual parsing), and the execution should succeed

- [ ] AC 8: Given the General Agent receives a request like "send an email to john@example.com saying hello", when processing, then it should produce an execution plan with one step: { worker_type: "gmail", action: "draft_email", input: { to: "john@example.com", body: "hello" } }

- [ ] AC 9: Given a task with 3 steps (Docs → Sheets → Gmail), when the Docs step completes, then the Router should advance to Sheets, when Sheets completes, Router should advance to Gmail, when Gmail completes, Router should detect completion and return to General Agent

- [ ] AC 10: Given the existing single-step tasks still work, when a user requests a simple calendar event creation, then the new architecture should handle it identically to the old architecture

## Additional Context

### Dependencies

- LangGraph's StateGraph, Annotation, START, END for graph definition
- LangChain's createAgent, DynamicStructuredTool, ChatMistralAI for agent creation
- Existing MCP service for Google API calls (mcpService)
- Existing ExecutionRunService for step tracking (executionRunService)
- Existing WorkerToolPolicyService for capability policy
- Existing AuditLogger for trace logging

### Testing Strategy

1. **Unit Tests** for each new node file:
   - Test system prompt generation from specialistPrompts.ts
   - Test tool spec building (DynamicStructuredTool creation)
   - Test handoff note format and content
   - Test tool invocation tracking via invocations array

2. **Integration Tests** for the full flow:
   - Test General Agent → Router → Specialist → Router → General Agent flow
   - Test time/date tool calculations with various inputs
   - Test multi-step plan execution with 2-5 steps
   - Test error handling in Router when specialist fails

3. **Regression Tests**:
   - Ensure existing single-step calendar/email creation still works
   - Ensure existing processors (EmailDraftProcessor, EmailSendProcessor) still function
   - Ensure existing command parsing (AssistantCommandProcessor) still works
   - Test with real Google API mocks to verify MCP integration unchanged

4. **Manual Testing**:
   - Test with real user requests like "put a reminder for tomorrow on my calendar"
   - Test multi-step request like "create a doc then send it to john via email"
   - Test edge cases: "next Monday at 3pm", "in 2 hours", "yesterday"

### Security & Robustness Hardening

#### Router Hardening
- Add routing validation: Verify specialist can handle the step before routing
- Add routing audit logs: Log every routing decision with reason
- Add timeout safety: If router takes > 2 seconds, fallback immediately
- Add routing sanity check: Verify specialist output matches expected schema

#### Time/Date Tool Hardening
- Add date validation: Reject dates > 1 year future or < 1 day past
- Add date format validation: Ensure ISO-8601 format
- Add timezone validation: Ensure valid IANA timezone
- Add human-readable confirmation: Show user the interpreted date

#### Tool Schema Hardening
- Add schema validation error handling: Return clear error messages
- Add schema testing: Unit tests with valid and invalid inputs
- Add schema documentation: Document expected inputs in tool descriptions
- Add retry limits: Escalate to user after 3 validation failures

#### Handoff Note Hardening
- Add handoff note validation: Validate schema before passing to next agent
- Add handoff note size limits: Truncate to 1000 characters
- Add handoff note sanitization: Escape JSON, remove control characters
- Add handoff note testing: Unit tests for each specialist's output format

#### Fallback Hardening
- Add single fallback: Only fallback once, then escalate to user
- Add fallback audit logging: Log when fallback is triggered and why
- Add fallback user notification: Inform user when fallback occurs
- Add fallback metrics: Track fallback rate, target < 5% after 2 weeks

#### Intent Clarification Hardening
- Add intent clarification: Ask user if request is ambiguous
- Add intent confidence scoring: Only route if confidence > 80%
- Add intent logging: Log intent decision and reasoning
- Add intent testing: Test ambiguous requests with planner LLM

### Notes

- The refactoring should be backward-compatible where possible
- Old `WorkspaceWorkerAgent` can be deprecated but not deleted initially
- All new nodes should follow the existing tracing/audit logging patterns
- System prompts should be in a centralized location (`specialistPrompts.ts`) for easy updates
- The Router node is the key innovation - it enables clean inter-agent routing based on task status
- Time/Date tool should handle all timezone-aware calculations consistently with existing codebase patterns
- Manual argument parsing removal will significantly reduce code complexity and potential bugs
