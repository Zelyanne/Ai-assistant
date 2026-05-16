# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.14.1-bookworm-slim

FROM ghcr.io/astral-sh/uv:latest AS uv

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/agent/package.json apps/agent/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
ARG VITE_SUPABASE_URL_PROJECT_GOOGLE_ASSITANT=
ARG VITE_SUPABASE_ANON_KEY_PROJECT_GOOGLE_ASSITANT=
ARG VITE_AGENT_URL_PROJECT_GOOGLE_ASSITANT=http://localhost:3001
ENV VITE_SUPABASE_URL_PROJECT_GOOGLE_ASSITANT=$VITE_SUPABASE_URL_PROJECT_GOOGLE_ASSITANT
ENV VITE_SUPABASE_ANON_KEY_PROJECT_GOOGLE_ASSITANT=$VITE_SUPABASE_ANON_KEY_PROJECT_GOOGLE_ASSITANT
ENV VITE_AGENT_URL_PROJECT_GOOGLE_ASSITANT=$VITE_AGENT_URL_PROJECT_GOOGLE_ASSITANT
COPY . .
RUN pnpm --filter @ai-assistant/shared build
RUN pnpm --filter @ai-assistant/agent build
RUN pnpm --filter @ai-assistant/web build

FROM base AS agent-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/agent/package.json apps/agent/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --filter @ai-assistant/agent... --prod --frozen-lockfile

FROM base AS agent
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=uv /uv /uvx /usr/local/bin/
COPY --from=agent-deps /app/node_modules ./node_modules
COPY --from=agent-deps /app/apps/agent/node_modules ./apps/agent/node_modules
COPY --from=agent-deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY package.json pnpm-workspace.yaml ./
COPY apps/agent/package.json apps/agent/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY --from=build /app/apps/agent/dist apps/agent/dist
COPY --from=build /app/packages/shared/dist packages/shared/dist
WORKDIR /app/apps/agent
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]

FROM caddy:latest AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /usr/share/caddy
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1/health >/dev/null || exit 1
