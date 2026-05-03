# SearXNG MCP Stack

Production-friendly compose stack for delegated web research.

## Services

- `searxng` → search backend (`http://localhost:8081` on the host, `http://searxng:8080` inside Compose)
- `searxng-mcp` → MCP wrapper (`http://localhost:3100/mcp`, health at `http://localhost:3100/health`)

## Start

```bash
docker compose -f infra/searxng-mcp/docker-compose.yml up -d
```

## Verify

```bash
curl http://localhost:3100/health
```

Expected: a healthy JSON payload.

## Agent runtime configuration

Set these in `apps/agent/.env`:

```bash
SEARXNG_MCP_URL_PROJECT_GOOGLE_ASSITANT=http://127.0.0.1:3100/mcp
SEARXNG_URL_PROJECT_GOOGLE_ASSITANT=http://127.0.0.1:8081
```

Optional if your MCP endpoint is protected:

```bash
SEARXNG_MCP_USERNAME_PROJECT_GOOGLE_ASSITANT=your_username
SEARXNG_MCP_PASSWORD_PROJECT_GOOGLE_ASSITANT=your_password
```

The bundled compose stack injects SearXNG settings that enable JSON output because the MCP wrapper reads `/search?format=json`. The same settings are mirrored in `infra/searxng-mcp/searxng/settings.yml` for deployments that prefer mounting a config file.

## Development notes

- If you already run a local/external SearXNG MCP instance, point `SEARXNG_MCP_URL` to it.
- The runtime uses health check + graceful tool errors, so research failures do not crash the full task pipeline.
