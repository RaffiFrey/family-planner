# syntax=docker/dockerfile:1.7
# API + worker image. Build from the repo root: docker build -f infra/docker/api.Dockerfile .
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --filter "@fp/api..." \
 && pnpm turbo run build --filter "@fp/api..." \
 && pnpm --filter @fp/api deploy --prod --legacy /out \
 && cp -r packages/db/migrations /out/node_modules/@fp/db/migrations

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /out .
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4000/v1/health || exit 1
# Override with `node dist/worker.js` for the worker deployment, or
# `node node_modules/@fp/db/dist/migrate.js` for the migration job.
CMD ["node", "--enable-source-maps", "dist/main.js"]
