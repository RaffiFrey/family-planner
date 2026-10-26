# Architecture

```
 Expo app ─┐                                  ┌─ PostgreSQL 17 (RLS per household)
 Web app ──┼─ REST /v1 + Socket.IO /realtime ─┤  Redis (BullMQ, rate limits, Socket.IO adapter)
 Admin ────┘   Better Auth /api/auth          ├─ S3-compatible storage (presigned uploads)
              Staff API /admin/v1             └─ Expo Push, SMTP, Stripe, RevenueCat
                   │
              NestJS modular monolith ── outbox ──► BullMQ workers (same image, `dist/worker.js`)
```

## Modules (apps/api/src/modules)

`households` (members, invitations, audit, GDPR requests) · `calendar` (RRULE series, exceptions, ICS feed) ·
`tasks` (fixed/floating recurrence, rotation, streaks) · `lists` (aisle categories, suggestions) ·
`finance` (accounts, transactions, transfers, splits, rules, budgets, imports, reports) · `storage`
(folders, presigned uploads, ClamAV, thumbnails) · `notifications` (in-app/push/email, preferences,
event handlers) · `billing` (entitlements, Stripe, RevenueCat) · `admin` (staff realm) · `maintenance`
(reminders, due tasks, digest, GDPR export/deletion, cleanup) · `events` (outbox relay, queues, realtime) ·
`finance-plus` (contracts/subscriptions detection, savings goals, shared expenses, advanced reports, PSD2 bank
sync via a provider interface: mock + finAPI) · `family` (recipes & meal plans, rewards & pocket money, pinboard &
polls, travel, photo albums) · `care` (documents vault with OCR and full-text search, contacts & emergency
cards, health incl. U-Untersuchungen, school timetable & holidays, home & vehicles, opt-in location sharing with
geofences) · `integrations` (Claude assistant with proposals that are only applied after confirmation, ICS
subscriptions, Google Calendar two-way sync).

Modules talk through their services and domain events, never through another module's tables.

## Request flow

1. `AuthGuard` resolves the Better Auth session and, for `/households/:householdId/...` routes, the caller's
   membership (non-members get 404). The endpoint's `action` is checked with `can()` from
   `@fp/domain/permissions`; item visibility (`household` / `private` / `members`) is applied in queries.
2. `@Input()` validates params/query/body with the endpoint's Zod schemas (422 with field paths).
3. Services run inside `db.tenant(actor, (tx, events) => …)`: a transaction on the `fp_app` role with
   `app.household_id` set, so Postgres RLS isolates households even if a filter is forgotten.
   `events.changed()/audit()/emit()` are written to `audit_log` and `outbox` in the same transaction.
4. `ResponseInterceptor` validates and strips the response against the contract.
5. Errors are RFC 9457 problem details (`code` for machine handling, e.g. `plan_limit`).

## Background work

The outbox relay (`FOR UPDATE SKIP LOCKED`) pushes `entity.changed` to Socket.IO rooms via the Redis emitter
and other events to the `events` queue. Handlers send notifications, check budget thresholds (once per
period), process uploads. Repeatable jobs in `maintenance` handle reminders, digests, GDPR and cleanup.
In development the API runs workers in-process (`RUN_WORKERS=true`); in production run `dist/worker.js`.

## Conventions

- TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (relaxed only in Nest/Next apps).
- ESLint `strict-type-checked` + Prettier; Conventional Commits (commitlint, husky).
- Money: integer minor units + ISO currency, never floats (`@fp/domain/money`).
- Time: instants in UTC + IANA zone; recurrence math on wall time so 09:00 stays 09:00 across DST.
- IDs: UUIDv7. Pagination: opaque cursors. POSTs accept `Idempotency-Key` (the client sends one automatically).
- Contracts in `@fp/contracts` are the single source of truth; never hand-write request types in clients.
- User-facing text via i18n keys; server-side texts (mails, push) via `translate()` from `@fp/i18n`.

## Adding modules

See [adding-a-module.md](adding-a-module.md) for the vertical-slice checklist (domain → schema → contract → API →
tests). Integration tests generate a migration from the current schema on the fly; the committed release
migration is created with `pnpm --filter @fp/db generate`.
