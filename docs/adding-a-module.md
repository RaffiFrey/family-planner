# Adding a feature module

Every feature follows the same vertical slice. Use `tasks` / `lists` / `finance` as reference implementations.

## 1. Domain logic — `packages/domain/src/<area>/`

Pure functions only (no I/O): calculations, validation, scheduling. Unit tests next to the code
(`*.test.ts`, Vitest, property tests with fast-check where it helps). The package enforces ≥90 % line coverage.
Money: integer minor units via `@fp/domain/money`. Dates/time zones: `@fp/domain/time`. Recurrence (RRULE,
"every N days after completion"): `@fp/domain/recurrence`.

## 2. Database — `packages/db/src/schema/<area>.ts`

Drizzle `pgTable` with helpers from `./_helpers.js`: `id()`, `createdAt()`, `updatedAt()`, `ts()`,
`tenantPolicy('<table>')`. **Every household table** has `household_id` (FK → `households`, cascade),
`tenantPolicy(...)` and `.enableRLS()`. Sensitive identifiers are stored encrypted (`CryptoService`) with a
display-safe suffix column. Never edit `migrations/` by hand; the release migration is generated with
`pnpm --filter @fp/db generate`. Integration tests generate a fresh migration from the schema automatically.

## 3. Contract — `packages/contracts/src/modules/<module>.ts`

Zod schemas + `defineEndpoint({...})` objects in an exported `<module>Contract` (already registered in
`src/index.ts`). Paths: `/v1/households/:householdId/<module>/...` with `params: withHousehold({...})`.
Responses use ISO strings for instants (`IsoDateTime`), `LocalDate` for dates, `MinorAmount` for money.
Create bodies apply defaults; update bodies are `.partial()` **without** defaults.

## 4. API — `apps/api/src/modules/<area>/`

- Controller: `@Controller()` class; each method `@Endpoint(C.x, { action: '<module>.read|write' })`,
  arguments `@Household() ctx` and `@Input() input: In<typeof C.x>`; return `Out<...>` via the service.
- Service: all tenant data access inside `this.db.tenant(actorOf(ctx), async (tx, ev) => …)`. Record
  `ev.changed('<entity>', id, 'created'|'updated'|'deleted', parentId?)` for realtime, `ev.audit(...)` for
  important actions and `ev.emit('<event>', payload)` for asynchronous work.
- Item visibility: `visibleTo(memberId, { visibility, owner, sharedWith? })` from `common/visibility.ts`.
- Errors: helpers in `common/errors.ts` (`notFound`, `forbidden`, `badRequest(detail, code)`, `planLimit`).
  Plan-gated features: `entitlementsFor(ctx.household.plan).features.includes('<feature>')` else `planLimit`.
- Async work: register handlers in `onModuleInit` with `queues.on('events', '<event>', job => …)`.
  Scheduled jobs: `queues.on('maintenance', '<job>', …)` and, in `onApplicationBootstrap`, if
  `env.RUN_WORKERS`, `queues.schedule('<job>', everyMs)`. Use `sentReminders`-style once-keys to avoid
  duplicate notifications.
- Notifications: `NotificationsService.notify({ householdId, memberIds, type, message: 'notifications.<key>', vars, link })`.
  Types and message keys are in `@fp/contracts` (`NOTIFICATION_TYPES`) and `@fp/i18n`.
- Workers/system jobs use `db.system` (bypasses RLS) and must filter by `household_id` explicitly; write
  outbox events with `flushEvents(tx, actor, events)`.

## 5. Tests

- Domain: unit tests (`pnpm --filter @fp/domain test`).
- API: an integration test `apps/api/test/<area>.int.test.ts` using `startStack()` / `TestClient` from
  `test/harness.ts` (real Postgres + Redis via Testcontainers). Cover permissions (child/teen/caregiver),
  tenant isolation and the main flows.
