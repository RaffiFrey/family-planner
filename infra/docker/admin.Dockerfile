# syntax=docker/dockerfile:1.7
# Next.js admin image (standalone output). Build from the repo root:
#   docker build -f infra/docker/admin.Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.com .
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile --filter "@fp/admin..." && pnpm turbo run build --filter "@fp/admin..."

FROM node:24-alpine AS runtime
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /repo/apps/admin/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build --chown=app:app /repo/apps/admin/public ./apps/admin/public
USER app
EXPOSE 3001
CMD ["node", "apps/admin/server.js"]
