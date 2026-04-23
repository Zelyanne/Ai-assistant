# SearXNG MCP Stack

Production-friendly compose stack for delegated web research.

## Services

- `searxng` → search backend (`http://localhost:8080`)
- `searxng-mcp` → MCP wrapper (`http://localhost:3000/mcp`, health at `http://localhost:3000/health`)

## Start

```bash
docker compose -f infra/searxng-mcp/docker-compose.yml up -d
```

## Verify

```bash
curl http://localhost:3000/health
```

Expected: a healthy JSON payload.

## Agent runtime configuration

Set these in `apps/agent/.env`:

```bash
SEARXNG_MCP_URL=http://127.0.0.1:3000/mcp
SEARXNG_URL=http://127.0.0.1:8080
```

Optional if your MCP endpoint is protected:

```bash
SEARXNG_MCP_USERNAME=your_username
SEARXNG_MCP_PASSWORD=your_password
```

## Development notes

- If you already run a local/external SearXNG MCP instance, point `SEARXNG_MCP_URL` to it.
- The runtime uses health check + graceful tool errors, so research failures do not crash the full task pipeline.
