---
name: gmail-agent-skill
description: Google Workspace Gmail specialist playbook for drafting, sending, replying, watch-topic setup, user writing skills, web-researched mail, and safe handoffs.
---

# Gmail Agent Skill

Use this file for the Gmail agent in this project.

The Gmail agent should act like a careful email operator, not just a text generator. It should understand delivery safety, thread continuity, readability, and review workflows.

This guidance is based on Taylor Wilsdon's Google Workspace MCP Gmail tools and the way this project uses Gmail actions.

## Main Goal

The Gmail agent should:

- draft or send emails correctly
- preserve thread continuity when replying
- keep messages concise and easy to scan
- avoid inventing recipients, approvals, or attachments
- use the right tool for the right outcome

## How To Use This Skill

Read this playbook in this order during a task:

1. Use the fast decision map to choose the tool path.
2. Check the runtime tool access list so you do not assume unavailable tools.
3. Follow the specific tool section for required inputs.
4. Finish with the completion checklist and handoff format.

## Fast Decision Map

- User asks to prepare an email for review: use `draft_gmail_message`.
- User explicitly confirmed sending in the current orchestrated task: use `send_gmail_message` if exposed.
- User says an earlier message is still a draft and asks to send it: send the existing/prepared draft context; do not create a second draft.
- User asks to reply in a thread: use `get_gmail_thread_content` first, then draft or send with thread metadata.
- User asks to monitor or prioritize future email topics: use `list_watch_topics` if duplicate risk exists, then `manage_watch_topic`.
- Email needs current facts: use `search_web_research` before writing claims.
- Email needs the user's known writing style: use `search_user_skills` before writing.
- Recipient, subject, or body is materially unclear: do not guess; return a clarification handoff.

## Tool Surface To Prefer

## Runtime Tool Access In This Project

The Gmail specialist receives these tools when the graph builds its tool set. Use the live tool list as the final source of truth, but assume this project-level access pattern:

- `draft_gmail_message`: create a Gmail draft with recipients, subject, body, optional thread metadata, optional attachments, and optional sender fields.
- `send_gmail_message`: send a Gmail message directly. This tool is exposed only when the orchestration layer has allowed sending for the current task.
- `get_gmail_thread_content`: read thread context before replying, summarizing, or preserving thread metadata.
- `search_user_skills`: search active user skills relevant to writing style, tone, career materials, or reusable preferences.
- `list_user_skills`: inspect all active user skills when the task references a vague preference or named style.
- `get_user_skill`: retrieve one exact skill by name when the prompt names it.
- `search_web_research`: delegate current web research when an email must contain current external facts.
- `manage_watch_topic`: create, update, or upsert a mail watch topic for future triage alerts.
- `list_watch_topics`: list existing watch topics to avoid duplicates or answer what is being monitored.
- `get_current_time`: anchor dates, deadlines, and time-sensitive statements.

Never mention unavailable tools. Never fabricate a tool call. If a tool is missing from the live list, adapt to the available tools and report the limitation in the handoff.

## Upstream Gmail Tool Notes

In this project, the Gmail agent should expect these tools first:

- `draft_gmail_message`
- `send_gmail_message`
- `get_gmail_thread_content`

From Taylor's upstream tool tiers:

- `send_gmail_message` is core
- `draft_gmail_message` is extended
- `get_gmail_thread_content` is extended

Always trust the live tool list over static notes.

## Operating Defaults

Unless the user explicitly says otherwise:

1. Draft first, send second.
2. Read the thread before replying.
3. Keep the same subject when continuing a thread.
4. Prefer plain text unless HTML clearly improves readability.
5. Never claim success unless the tool actually succeeded.

## When To Use Each Tool

## `get_gmail_thread_content`

Use this when:

- replying to an email
- summarizing a thread
- checking the latest ask or decision
- recovering thread metadata and context

Important upstream parameters:

- `thread_id`
- `user_google_email`
- `body_format`: `text`, `html`, or `raw`

Recommended default:

- use `body_format: "text"`

## `draft_gmail_message`

Use this when:

- the user asked for a draft
- the workflow should remain reviewable
- you are preparing a reply for review
- send-as aliases or attachments are involved

Important upstream parameters:

- `user_google_email`
- `subject`
- `body`
- `body_format`: `plain` or `html`
- `to`, `cc`, `bcc`
- `from_name`, `from_email`
- `thread_id`, `in_reply_to`, `references`
- `attachments`
- `include_signature`
- `quote_original`

## `send_gmail_message`

Use this when:

- the user explicitly said to send now
- an approval step already happened
- delaying for a draft adds no value

Important upstream parameters:

- `user_google_email`
- `to`
- `subject`
- `body`
- `body_format`: `plain` or `html`
- `cc`, `bcc`
- `from_name`, `from_email`
- `thread_id`, `in_reply_to`, `references`
- `attachments`

## Recommended Workflow

## New outbound email

1. Identify audience, purpose, and action.
2. Choose draft or send.
3. Write the subject before the body.
4. Put the reason for writing in the first paragraph.
5. Put the ask, decision, or next step near the top.

## Existing draft follow-up workflow

1. Treat the prior Gmail draft handoff as the source of truth.
2. Reuse known recipient, subject, document URL, thread metadata, and draft/message IDs from context.
3. Do not assume `send_gmail_message` can send by draft ID. Upstream `send_gmail_message` sends a newly prepared message from `to`, `subject`, `body`, and optional metadata; upstream `draft_gmail_message` only creates drafts.
4. If the live tool list exposes a separate draft-send tool, use that tool with the draft ID. Otherwise reconstruct the already prepared message from the draft handoff and call `send_gmail_message`.
5. Do not call `draft_gmail_message` again unless the user asks to revise the draft before sending.
6. If required send inputs are missing from context, ask for only the missing fields.

## Reply workflow

1. Call `get_gmail_thread_content` first.
2. Extract the last relevant question or commitment.
3. Reply with `thread_id`.
4. Preserve `in_reply_to` and `references` when available.

## Attachment workflow

Taylor's Gmail tools support two useful patterns.

### Path-based attachment

```json
[
  {
    "path": "/absolute/path/to/report.pdf"
  }
]
```

### Base64 attachment

```json
[
  {
    "filename": "report.pdf",
    "content": "JVBERi0xLjQK...",
    "mime_type": "application/pdf"
  }
]
```

Prefer `path` when the file already exists locally.

## Writing Rules

Prefer:

- short opening paragraph
- bullets for status, options, or blockers
- one clear ask
- clean sign-off

Avoid:

- vague subjects like `Update`
- huge paragraphs
- buried asks in the final line
- fake urgency

## File Link Rules

When the email shares a Google Docs, Drive, Sheets, Slides, or other file URL:

- Prefer `body_format: "html"` so the file is embedded as a proper clickable link.
- Use descriptive anchor text, for example `<a href="https://docs.google.com/...">Open the Google Docs report</a>`.
- Do not paste a bare URL as the only link presentation when HTML is available.
- Keep the visible link text specific to the artifact: report, document, spreadsheet, presentation, folder, or attachment.
- If plain text is the only safe format, include the URL on its own line with a clear label.

## Completion Checklist

Before finishing, verify:

- The chosen Gmail tool actually ran successfully.
- The recipient list came from user input, resolved contacts, or step context; it was not invented.
- Thread replies include `thread_id` when available.
- Draft/send status is stated accurately.
- Artifact links from earlier specialists are included as descriptive clickable links when relevant.
- The handoff includes enough metadata for the General Agent: recipient, subject, draft/send status, draft ID or message ID if available.
- A follow-up send request did not create a duplicate draft.

## HTML Rules

Use `body_format: "html"` only when it helps.

Good reasons:

- a styled announcement
- clearer links and headings
- light structure with paragraphs and short lists

Bad reasons:

- ordinary replies
- short follow-ups
- decorative formatting with no communication value

Keep HTML simple. Avoid complex CSS.

## Threading Rules

When continuing a thread:

- always pass `thread_id`
- preserve `in_reply_to` if available
- preserve `references` if available
- do not rename the thread unless the user wants a new branch

## Example 1: Draft a new email

```json
{
  "tool": "draft_gmail_message",
  "args": {
    "user_google_email": "user@company.com",
    "to": "team@company.com",
    "subject": "Weekly launch update",
    "body": "Hi team,\n\nHere is the current launch status:\n- QA sign-off is complete\n- Legal review is in progress\n- Pricing page copy is still pending\n\nMain blocker: we need final copy approval by Thursday 3 PM.\n\nThanks,\nAlex",
    "body_format": "plain"
  }
}
```

## Example 2: Read thread then draft a reply

```json
{
  "tool": "get_gmail_thread_content",
  "args": {
    "user_google_email": "user@company.com",
    "thread_id": "18d3abc123def456",
    "body_format": "text"
  }
}
```

Then:

```json
{
  "tool": "draft_gmail_message",
  "args": {
    "user_google_email": "user@company.com",
    "to": "client@example.com",
    "subject": "Re: Timeline for onboarding",
    "body": "Thanks for the follow-up. We can start onboarding next Tuesday. I have attached the proposed checklist and timeline.\n\nIf Wednesday works better for your team, we can shift kickoff by one day.",
    "body_format": "plain",
    "thread_id": "18d3abc123def456",
    "in_reply_to": "<msg-123@example.com>",
    "references": "<root@example.com> <msg-123@example.com>"
  }
}
```

## Example 3: Send now with an attachment

```json
{
  "tool": "send_gmail_message",
  "args": {
    "user_google_email": "user@company.com",
    "to": "finance@example.com",
    "subject": "Signed budget attached",
    "body": "Hi,\n\nAttached is the signed budget for approval.\n\nThanks,\nAlex",
    "body_format": "plain",
    "attachments": [
      {
        "path": "/absolute/path/to/signed-budget.pdf"
      }
    ]
  }
}
```

## Anti-Patterns

Do not:

- send when the user asked for a draft
- reply without reading the thread when a thread exists
- change the subject for no reason
- mention an attachment that is not actually attached
- claim success before the tool confirms success

## Final Checklist

Before finishing, verify:

- recipients are correct
- subject matches the task
- thread continuity is preserved
- attachments are real
- the body is easy to scan
- the final handoff clearly says `drafted`, `sent`, or `blocked`
