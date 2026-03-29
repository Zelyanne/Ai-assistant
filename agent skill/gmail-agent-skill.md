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

## Tool Surface To Prefer

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
