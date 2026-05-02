---
title: 'AI Assistant Chat + Topic Watch Harness Refactor'
type: 'refactor'
created: '2026-04-29T00:00:00Z'
status: 'done'
baseline_commit: 'ef0545b0d7e2366de44dd616e99e96c90a51f612'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-03-05.md'
  - '{project-root}/_bmad-output/implementation-artifacts/tech-spec-user-initiated-channel-commands-no-escalation-social-setup.md'
  - '{project-root}/_bmad-output/implementation-artifacts/tech-spec-scheduled-agent-requests-oneoff-finite.md'
---

<frozen-after-approval reason="human-owned intent -- do not modify unless human renegotiates">

## Intent

**Problem:** The app still reads as a command-center/workflow product, but the target product is an AI assistant the user chats with from Telegram or web and trusts to perform Google Workspace actions. Watch topics exist in the site, but the assistant cannot create them from chat or turn matched emails into actionable conversations.

**Approach:** Add an assistant-harness slice inspired by NousResearch Hermes Agent: a platform-agnostic assistant core shared by web and Telegram, thin channel adapters, registry-style assistant tools, persistent chat context, observable execution, and background watch-topic notifications. The first implementation must reuse the existing LangGraph General Agent/Router/Specialists, Supabase task queue, `watch_topics`, email triage, `channel.send`, and Command Center tables instead of rewriting the app.

## Boundaries & Constraints

**Always:** Keep `assistant.command` as the primary web/Telegram intent entrypoint. Treat Telegram and web chat as equivalent assistant surfaces with shared context, task status, and ask-then-act replies. Let the assistant create/update/list watch topics from natural language. When a watched email is found, summarize it and ask what to do next. Preserve safety: high-risk sends require confirmation, automated email-derived tasks still respect agency/perimeter rules, and all agent actions are audit logged.

**Ask First:** Ask before replacing the current LangGraph implementation, adding a new agent framework/runtime, changing Supabase auth/RLS semantics, enabling auto-send behavior for matched emails, introducing paid third-party services, or storing Telegram/Google secrets in a new persistence model.

**Never:** Do not fork Hermes or copy its Python runtime into this app. Do not make watch topics a calendar alarm. Do not create a parallel messaging stack beside `channelRouter` and existing webhook routes. Do not bypass RLS from the frontend. Do not send full email bodies to Telegram unless explicitly requested by the user.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Chat creates watch topic | User says: “watch emails about APSEC” | Scoped `watch_topics` row is created/updated and confirmed in chat | If org/user missing, pause with account-linking guidance |
| Duplicate watch topic | Similar topic exists for same org/user | Existing row is reused or updated; no duplicate row | If ambiguous, ask which topic to update |
| Matched email alert | Triage classifies a thread with a watch-topic match | Send concise Telegram/web summary plus “draft / summarize / ignore / remind me” prompt | If Telegram is not linked, write web alert only |
| Ask-then-act reply | User replies “draft a response” to a topic alert | Reply is routed as `assistant.command` with alert/thread context so Gmail specialist drafts or prepares the requested action | If source thread is missing or inaccessible, pause and ask for clarification |
| High-risk action | User asks to send a reply directly | Assistant asks for confirmation before sending; draft-only remains allowed without send confirmation | Rejection/timeout leaves the draft or task paused, not failed silently |

</frozen-after-approval>

## Code Map

- `apps/agent/src/controller/nodes/generalAgent.ts` -- Primary `assistant.command` planner and existing typed tool pattern.
- `apps/agent/src/controller/nodes/specialistToolBuilder.ts` -- Adds non-MCP assistant tools to specialists.
- `apps/agent/src/prompts/specialistPrompts.ts` -- General/Gmail prompt rules for watch-topic creation and alert handoffs.
- `apps/agent/src/processors/EmailTriageProcessor.ts` -- Loads `watch_topics` and writes topic matches to `ingested_threads.classification`.
- `apps/agent/src/processors/ChannelSendProcessor.ts` and `apps/agent/src/services/channelRouter.ts` -- Existing channel send/inbound routing paths.
- `apps/web/src/views/CommandCenter.vue` and `apps/web/src/composables/useCommandCenter.ts` -- Current web chat surface and conversation persistence.
- `apps/web/src/components/WatchTopics.vue` -- Existing watch-topic CRUD contract.

## Tasks & Acceptance

**Execution:**
- [x] `apps/agent/src/services/WatchTopicService.ts` -- Add scoped create/update/list watch-topic service -- safe backend path matching UI CRUD.
- [x] `apps/agent/src/tools/watchTopicTools.ts` -- Add typed `manage_watch_topic` and `list_watch_topics` tools -- Hermes-style tool boundary without new runtime.
- [x] `apps/agent/src/controller/nodes/generalAgent.ts` and `apps/agent/src/controller/nodes/specialistToolBuilder.ts` -- Register watch-topic tools for General and Gmail only -- supports natural chat control without broad specialist access.
- [x] `apps/agent/src/prompts/specialistPrompts.ts` -- Teach General/Gmail watch-topic rules, duplicate handling, and ask-then-act behavior -- prevents calendar-alarm interpretation.
- [x] `apps/agent/src/processors/EmailTriageProcessor.ts` and `apps/agent/src/services/TopicWatchAlertService.ts` -- Convert topic matches into idempotent Telegram/web alert messages with thread context -- connects existing triage to proactive chat.
- [x] `apps/web/src/views/CommandCenter.vue` and `apps/web/src/components/layout/AppSidebar.vue` -- Shift labels from “Command Center” toward “Assistant” while preserving routes -- makes the app chat-first without breaking navigation.
- [x] Affected `*.spec.ts` files -- Cover watch-topic tools, alert delivery fallback, duplicate suppression, and ask-then-act reply context -- protects cross-layer behavior.

**Acceptance Criteria:**
- Given a linked Telegram user or web user asks to watch mail about a topic, when the assistant processes the request, then a scoped `watch_topics` row exists and the chat confirms the watch.
- Given a watched-topic email is classified, when alert delivery runs, then Telegram and web chat receive the same concise alert without duplicate sends.
- Given the user replies to a topic alert with “draft a response,” when the command is queued, then the Gmail specialist receives the original thread/topic context and produces a draft rather than sending automatically.
- Given Telegram is not linked, when a topic alert is generated, then the system writes the alert to web chat and tells the user how to connect Telegram.
- Given an automated email-derived task violates safety rules, when it runs, then existing escalation/perimeter behavior remains active.

## Spec Change Log

## Design Notes

NousResearch Hermes Agent patterns to adapt, not copy: one platform-agnostic assistant core, thin channel adapters, typed tools, persistent session context, observable execution, and background work delivered back to a target channel. In this app that maps to `assistant.command` + LangGraph nodes + Supabase queues.

The watch-topic alert should be “ask then act”: summarize the matched mail and offer next actions. Example alert copy: `I found a new APSEC-related email from <sender>: <one-sentence summary>. Want me to draft a reply, summarize the full thread, remind you later, or ignore it?`

## Verification

**Commands:**
- `pnpm --filter @ai-assistant/agent test -- --run` -- expected: agent service/node tests pass.
- `pnpm --filter @ai-assistant/web test -- --run` -- expected: web command/watch topic tests pass.
- `pnpm lint` -- expected: no lint errors from touched TypeScript/Vue files.

**Manual checks (if no CLI):**
- From web chat, ask to watch a topic and confirm it appears in Brain Setup watch topics.
- From Telegram, ask to watch a topic and confirm the same DB row is created.
- Simulate or run email triage with a matching thread and confirm a Telegram/web ask-then-act alert appears.

## Suggested Review Order

**Assistant Tooling**

- Start with scoped watch-topic persistence and duplicate handling.
  [`WatchTopicService.ts:131`](../../apps/agent/src/services/WatchTopicService.ts#L131)

- Review the LangChain tool boundary exposed to agents.
  [`watchTopicTools.ts:56`](../../apps/agent/src/tools/watchTopicTools.ts#L56)

- Check General Agent routing for watch-topic outcomes.
  [`generalAgent.ts:353`](../../apps/agent/src/controller/nodes/generalAgent.ts#L353)

- Confirm Gmail-only specialist tool exposure.
  [`specialistToolBuilder.ts:124`](../../apps/agent/src/controller/nodes/specialistToolBuilder.ts#L124)

**Topic Alerts**

- Review ask-then-act alert text and channel fanout.
  [`TopicWatchAlertService.ts:93`](../../apps/agent/src/services/TopicWatchAlertService.ts#L93)

- Confirm triage passes keywords into classification prompts.
  [`EmailTriageProcessor.ts:146`](../../apps/agent/src/processors/EmailTriageProcessor.ts#L146)

- Verify topic matches trigger alerts without failing triage.
  [`EmailTriageProcessor.ts:811`](../../apps/agent/src/processors/EmailTriageProcessor.ts#L811)

**Reply Context**

- Check Telegram replies inherit prior topic-watch context.
  [`channelRouter.ts:301`](../../apps/agent/src/services/channelRouter.ts#L301)

- Check web replies preserve thread metadata in context.
  [`useCommandCenter.ts:961`](../../apps/web/src/composables/useCommandCenter.ts#L961)

**UI Copy**

- Confirm chat surface now reads as Assistant.
  [`CommandCenter.vue:56`](../../apps/web/src/views/CommandCenter.vue#L56)

- Confirm navigation label preserves route compatibility.
  [`AppSidebar.vue:8`](../../apps/web/src/components/layout/AppSidebar.vue#L8)

**Tests**

- Review scoped duplicate and similar-topic service coverage.
  [`WatchTopicService.spec.ts:95`](../../apps/agent/src/services/WatchTopicService.spec.ts#L95)

- Review inbound Telegram topic-watch reply context coverage.
  [`channelRouter.spec.ts:157`](../../apps/agent/src/services/channelRouter.spec.ts#L157)
