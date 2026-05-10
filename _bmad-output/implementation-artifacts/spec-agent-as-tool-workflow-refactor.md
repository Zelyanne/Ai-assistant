---
title: 'Agent-As-Tool Workflow Refactor'
type: 'refactor'
created: '2026-05-05T04:46:12Z'
status: 'done'
baseline_commit: 'fee2a136396fbdca8d8bf7146a3afbc84e041363'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture.md'
  - '{project-root}/_bmad-output/implementation-artifacts/tech-spec-langgraph-multi-agent-refactor.md'
---

<frozen-after-approval reason="human-owned intent -- do not modify unless human renegotiates">

## Intent

**Problem:** The current assistant command path still behaves like General Agent -> Router -> specialist nodes, so the General Agent plans work but does not directly control specialist delegation. Alexis wants a different architecture where every specialist/subagent is exposed as a callable tool with a `prompt` parameter, and the General Agent owns the subcalling loop.

**Approach:** Refactor `assistant.command` into a General-Agent-first LangGraph path: General Agent receives the user request, calls specialist-agent tools such as Gmail/Calendar/Docs with prompt-only instructions, receives structured handoff results, then passes through verification nodes before finalizing. Keep existing specialist MCP tool execution, audit logging, user-skill retrieval, safety guards, and legacy router/worker code as fallback rather than deleting it.

## Boundaries & Constraints

**Always:** Specialist-agent tools expose `prompt` as the primary user-visible parameter. Each tool must inject only relevant static/user skills for its specialist and prompt. Subagent returns must be structured enough for the General Agent to continue: summary, handoff_content, artifacts/ids/URLs, tool_invocations, status, and any next_prompt. All autonomous actions must keep PerimeterGuard, high-risk confirmation, idempotency/audit traces, and existing Google MCP tool policies.

**Ask First:** Ask before changing Supabase schemas, adding a new agent framework/dependency, removing Router/WorkspaceWorker fallback code, enabling parallel specialist-agent calls with persistent state, auto-sending Gmail without the existing confirmation guard, or replacing existing non-`assistant.command` processor routes.

**Never:** Do not make specialists converse directly with the user. Do not pass all skills to every subagent. Do not bypass `mcpService.getLangChainTools`, `WorkerToolPolicyService`, `UserSkillsService`, or audit logging. Do not copy Python DeepAgents or introduce a parallel runtime.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Multi-specialist request | User asks: "create a doc summary and email it to John" | General Agent calls docs-agent tool with a prompt, receives doc handoff, then calls gmail-agent tool with a prompt that includes the doc handoff | If Gmail lacks a recipient, pause with a specific clarification prompt |
| Relevant skills | User asks Gmail to draft a job email and has saved writing/interview skills | Gmail-agent tool receives only matching user/static skills in its prompt context | If skill lookup fails, continue without skills and record the lookup failure in trace |
| Bad subagent output | Specialist returns no handoff_content, no artifact, or status failed | Verification node rejects completion and returns a repair prompt or escalation | Do not mark the task done until verification passes or user guidance is requested |
| Legacy direct action | Task is `email.draft`, `calendar.create`, or `thread.action` | Existing processor/legacy graph route still runs unchanged | Existing error/escalation behavior remains active |

</frozen-after-approval>

## Code Map

- `apps/agent/src/controller/nodes/generalAgent.ts` -- Current assistant command owner; must receive specialist-agent tools and stop producing router-only execution plans for the new path.
- `apps/agent/src/controller/nodes/router.ts` -- Existing specialist dispatcher; keep as fallback/reference, but remove it from the default `assistant.command` success path.
- `apps/agent/src/controller/graph.ts` -- LangGraph topology; route `assistant.command` through General Agent, verification, then finalize.
- `apps/agent/src/controller/nodes/{gmail,calendar,docs,sheets,slides,drive}Agent.ts` -- Existing specialist executors to wrap as prompt-only tools.
- `apps/agent/src/controller/nodes/specialistToolBuilder.ts` -- Existing MCP/user-skill/research/time tool builder; extend so specialist-agent tools get scoped skills from the prompt.
- `apps/agent/src/controller/nodes/types.ts` -- Shared contracts for specialist tool input/output and verification state.
- `apps/agent/src/prompts/specialistPrompts.ts` and `apps/agent/src/prompts/agentSkillInjector.ts` -- Canonical prompts/capability descriptions and static skill injection.
- `apps/agent/src/services/UserSkillsService.ts` -- User skill relevance search to reuse for per-prompt skill selection.

## Tasks & Acceptance

**Execution:**
- [x] `apps/agent/src/controller/nodes/types.ts` -- Add `AgentToolPromptInput`, `AgentToolResult`, and verifier result types -- locks the General Agent/subagent contract.
- [x] `apps/agent/src/controller/nodes/agentToolRegistry.ts` -- Create specialist-agent tools (`ask_gmail_agent`, `ask_calendar_agent`, etc.) with schema `{ prompt: string }` that wrap existing specialist node functions -- implements subagents-as-tools without new dependencies.
- [x] `apps/agent/src/controller/nodes/specialistToolBuilder.ts` and `apps/agent/src/prompts/agentSkillInjector.ts` -- Add prompt-scoped skill selection for every specialist, combining static skill appendices and `UserSkillsService.findRelevantSkills` -- keeps skills relevant per subagent.
- [x] `apps/agent/src/controller/nodes/generalAgent.ts` -- Replace default router-plan execution for `assistant.command` with a tool-calling General Agent that can call specialist-agent tools and store their structured results -- makes the General Agent own subcalling and continuation.
- [x] `apps/agent/src/controller/nodes/executionVerifier.ts` -- Add post-General verification that checks original request, specialist outputs, artifacts, failures, and required handoff fields -- prevents false task completion.
- [x] `apps/agent/src/controller/graph.ts` -- Add verification state/node and route `assistant.command` General Agent output to verifier before finalize; keep non-assistant processor routing unchanged -- modifies the LangGraph flow safely.
- [x] `apps/agent/src/prompts/specialistPrompts.ts` -- Update General and specialist prompt rules for prompt-only delegation, structured returns, skill usage, and no direct user conversation by specialists -- aligns model behavior with the new contract.
- [x] `apps/agent/src/controller/nodes/*.spec.ts` and `apps/agent/src/controller/graph.spec.ts` -- Cover agent-tool wrapping, skill scoping, General Agent multi-call flow, verifier rejection, and legacy route preservation -- protects the refactor.

**Acceptance Criteria:**
- Given an `assistant.command` that needs Docs then Gmail, when the graph runs, then the General Agent calls specialist-agent tools in sequence and the default path does not use `routerNode`.
- Given a specialist-agent tool is called, when it receives `{ prompt }`, then it runs with only its allowed MCP tools plus relevant prompt-scoped skills.
- Given a specialist completes, when it returns to the General Agent, then its result contains `summary`, `handoff_content`, `status`, and artifact/tool invocation metadata needed for the next call.
- Given verification detects an incomplete or failed specialist result, when the verifier runs, then the task is paused/escalated with a repair prompt instead of finalized as done.
- Given a non-`assistant.command` task, when the graph runs, then the existing processor route and behavior are unchanged.

## Spec Change Log

- 2026-05-05: Implemented agent-as-tool workflow refactor for `assistant.command`, including prompt-only specialist tools, scoped skill injection, execution verifier, graph routing, and regression coverage.
- 2026-05-05: Review fixes added Gmail send-tool gating at the agent-tool boundary, safer invocation/artifact metadata, verifier evidence hardening, expected-specialist checks, and per-specialist trace summaries.
- 2026-05-06: Hardened Workspace MCP startup handling with one-shot retry after startup rejection, per-org tool fetch error tracking, and a clear paused setup prompt only when MCP tool fetching actually failed.
- 2026-05-06: Moved paused-turn continuation handling from code-level natural-language approval matching into a structured General Agent resolver, while keeping code as the final high-risk send safety gate.
- 2026-05-06: Hardened General Agent structured-output parsing so missing or malformed planner output pauses for retry instead of crashing the graph.
- 2026-05-06: Added agent-mediated recent-turn continuation resolution so a completed draft/report handoff can be sent when the user confirms in the next message.

## Design Notes

Context7 and SearXNG research both support this direction: LangChain/LangGraph document the subagents pattern as a main agent coordinating specialized agents as tools, with Zod schemas for predictable tool I/O. LangChain also frames skills as progressive disclosure, which maps to prompt-scoped skill retrieval instead of injecting every skill into every specialist. The implementation should use existing `createAgent`, existing specialist node functions, and Zod-validated tool results; no new framework is needed.

The older `tech-spec-langgraph-multi-agent-refactor.md` proposed Router -> specialist nodes. This spec intentionally supersedes that default flow for `assistant.command` only: Router and `WorkspaceWorkerAgent` remain available as compatibility/fallback seams until the agent-tool path is proven stable.

## Verification

**Commands:**
- `pnpm --filter @ai-assistant/agent exec vitest run src/controller/nodes/agentToolRegistry.spec.ts src/controller/nodes/executionVerifier.spec.ts src/controller/nodes/gmailAgent.spec.ts src/controller/nodes/specialistToolBuilder.spec.ts src/controller/nodes/specialistNodes.spec.ts src/controller/graph.spec.ts src/services/mcp.startup.spec.ts` -- passed, 7 files / 62 tests.
- `pnpm --filter @ai-assistant/agent build` -- passed.
- `pnpm --filter @ai-assistant/agent exec eslint src/controller/nodes/generalAgent.ts src/controller/graph.spec.ts src/services/mcp.ts src/services/mcp.startup.spec.ts src/controller/nodes/agentToolRegistry.ts src/controller/nodes/executionVerifier.ts src/controller/nodes/gmailAgent.ts src/controller/nodes/specialistToolBuilder.ts src/prompts/agentSkillInjector.ts src/prompts/specialistPrompts.ts src/controller/nodes/types.ts src/controller/nodes/agentToolRegistry.spec.ts src/controller/nodes/executionVerifier.spec.ts src/controller/nodes/gmailAgent.spec.ts src/controller/nodes/specialistToolBuilder.spec.ts` -- passed.
- `pnpm lint` -- failed on unrelated pre-existing lint errors outside this patch's changed files; touched-file ESLint is clean.

## Suggested Review Order

**Agent Tool Delegation**

- Start here: prompt-only specialist tools wrap existing specialist nodes.
  [`agentToolRegistry.ts:244`](../../apps/agent/src/controller/nodes/agentToolRegistry.ts#L244)

- General Agent calls specialist tools before falling back to router plans.
  [`generalAgent.ts:712`](../../apps/agent/src/controller/nodes/generalAgent.ts#L712)

- Agent-tool results route through verifier before task finalization.
  [`graph.ts:1998`](../../apps/agent/src/controller/graph.ts#L1998)

**Safety And Verification**

- Gmail send tool is removed for unconfirmed agent-tool prompts.
  [`gmailAgent.ts:157`](../../apps/agent/src/controller/nodes/gmailAgent.ts#L157)

- Verifier requires domain evidence, not support-only tool calls.
  [`executionVerifier.ts:90`](../../apps/agent/src/controller/nodes/executionVerifier.ts#L90)

- Original request is preserved for expected-specialist verification.
  [`generalAgent.ts:1251`](../../apps/agent/src/controller/nodes/generalAgent.ts#L1251)

- Specialist trace summaries expose tools, artifacts, and errors.
  [`generalAgent.ts:95`](../../apps/agent/src/controller/nodes/generalAgent.ts#L95)

- MCP startup failures pause with an actionable workspace-tools message instead of generic planning failure.
  [`generalAgent.ts:726`](../../apps/agent/src/controller/nodes/generalAgent.ts#L726)

- MCP startup retries once after a rejected shared-server readiness promise.
  [`mcp.ts:110`](../../apps/agent/src/services/mcp.ts#L110)

- Paused follow-up confirmation is resolved by a structured General Agent decision instead of phrase matching.
  [`generalAgent.ts:534`](../../apps/agent/src/controller/nodes/generalAgent.ts#L534)

**Skill Scoping**

- Prompt-scoped skills combine static appendices and user relevance search.
  [`agentSkillInjector.ts:117`](../../apps/agent/src/prompts/agentSkillInjector.ts#L117)

- Specialist prompts receive General Agent handoff and scoped skills.
  [`specialistToolBuilder.ts:136`](../../apps/agent/src/controller/nodes/specialistToolBuilder.ts#L136)

**Regression Coverage**

- Graph test proves agent-tool path bypasses router execution.
  [`graph.spec.ts:689`](../../apps/agent/src/controller/graph.spec.ts#L689)

- Registry tests cover prompt-only wrapping and confirmation propagation.
  [`agentToolRegistry.spec.ts:105`](../../apps/agent/src/controller/nodes/agentToolRegistry.spec.ts#L105)

- Gmail tests cover send-tool removal for unconfirmed prompts.
  [`gmailAgent.spec.ts:123`](../../apps/agent/src/controller/nodes/gmailAgent.spec.ts#L123)

- Verifier tests cover malformed, support-only, and missing-agent outputs.
  [`executionVerifier.spec.ts:49`](../../apps/agent/src/controller/nodes/executionVerifier.spec.ts#L49)

- MCP startup tests cover readiness log patterns, early process exit, timeout, and retry after rejection.
  [`mcp.startup.spec.ts:60`](../../apps/agent/src/services/mcp.startup.spec.ts#L60)

- Graph tests cover natural-language send approval as a paused-turn continuation decided by the agent resolver.
  [`graph.spec.ts:1855`](../../apps/agent/src/controller/graph.spec.ts#L1855)
