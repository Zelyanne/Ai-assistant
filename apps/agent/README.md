# AI Assistant Agent

The Agent Controller is responsible for monitoring the `tasks` table in Supabase and executing the LangGraph agent to fulfill user requests.

## Telemetry & Observability

This project uses **LangSmith** for tracing and monitoring agent execution.

### Configuration

To enable tracing, add the following variables to your `apps/agent/.env` file:

```env
LANGCHAIN_TRACING_V2=true
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
LANGCHAIN_API_KEY=your_langsmith_api_key
LANGCHAIN_PROJECT=ai-assistant
```

- `LANGCHAIN_TRACING_V2`: Set to `true` to enable tracing.
- `LANGCHAIN_API_KEY`: Your LangSmith API key.
- `LANGCHAIN_PROJECT`: The project name in LangSmith (defaults to `ai-assistant`).

### Metadata and Filtering

Every trace automatically includes the following metadata for granular filtering:
- `task_id`: The UUID of the task from Supabase.
- `organization_id`: The organization the task belongs to.
- `domain_action`: The specific action being performed (e.g., `email_triage`, `calendar_create`).

Traces are also tagged with the `domain_action`.

### Tracing in Development

On startup, the agent will log its tracing status:
`[Config] LangSmith tracing: ENABLED`

If `LANGCHAIN_TRACING_V2` is `true` but the API key is missing, a warning will be displayed, but the application will not crash.
