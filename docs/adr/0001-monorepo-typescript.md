# ADR-0001: TypeScript monorepo (pnpm + Turborepo)

Status: accepted (2026-10-25)

Web (Next.js), mobile (Expo) and API (NestJS) are all TypeScript, so domain logic, contracts, i18n and tokens
are shared packages. pnpm workspaces + Turborepo give one lockfile and cached pipelines. TypeScript is pinned
to 6.0.x because typescript-eslint does not support 7.x yet.
