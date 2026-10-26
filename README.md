# Family Planer

Everything a family needs in one app: shared calendar, chores with rotation, realtime shopping lists,
household finance (accounts, CSV/CAMT/MT940 import, rules, budgets, reports), file storage,
notifications — on web, iOS and Android, plus an internal admin console. DACH first (German/English, EUR,
GDPR, EU hosting).

## Monorepo

| Path                  | What                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------- |
| `apps/api`            | NestJS 12 (Fastify) modular monolith: REST + Socket.IO, BullMQ workers, Better Auth     |
| `apps/web`            | Next.js 16 customer web app (App Router, TanStack Query, Tailwind v4)                   |
| `apps/admin`          | Next.js 16 internal admin console (separate staff realm, TOTP)                          |
| `apps/mobile`         | Expo SDK 58 app for iOS/Android (expo-router, NativeWind)                               |
| `packages/domain`     | Pure business logic: money, time zones, recurrence (RRULE), finance import, permissions |
| `packages/contracts`  | Zod API contracts → request validation, OpenAPI, typed client                           |
| `packages/api-client` | Typed client, TanStack Query helpers, realtime connection                               |
| `packages/db`         | Drizzle schema, migrations with Postgres row-level security, seeds                      |
| `packages/i18n`       | Shared de/en strings and formatting                                                     |
| `packages/ui-tokens`  | Design tokens (Tailwind v4 theme + RN values)                                           |
| `packages/config`     | Shared tsconfig and ESLint presets                                                      |
| `infra/`              | docker-compose for local services, Dockerfiles                                          |
| `docs/`               | Architecture notes and ADRs                                                             |

## Getting started

Requirements: Node 24, pnpm 12, Docker.

```bash
pnpm install
cp .env.example .env
pnpm infra:up                 # Postgres, Redis, S3 (SeaweedFS), Mailpit
pnpm turbo run build          # build shared packages
pnpm db:migrate && pnpm db:seed
pnpm --filter @fp/api dev     # http://localhost:4000  (docs: /docs, OpenAPI: /openapi.json)
pnpm --filter @fp/web dev     # http://localhost:3000
pnpm --filter @fp/admin dev   # http://localhost:3001  (bootstrap admin from .env, TOTP on first login)
pnpm --filter @fp/mobile start
```

Mail sent locally lands in Mailpit: http://localhost:8025. For virus scanning start ClamAV with
`docker compose -f infra/docker-compose.yml --profile full up -d` and set `CLAMAV_HOST=localhost`.

## Quality gates

```bash
pnpm turbo run lint typecheck test build      # everything
pnpm --filter @fp/api test:integration        # API against real Postgres/Redis (Testcontainers)
pnpm --filter @fp/web exec playwright test    # web E2E (needs the API running)
pnpm --filter @fp/admin exec playwright test  # admin E2E
maestro test apps/mobile/.maestro/config.yaml apps/mobile/.maestro  # native mobile E2E
```

### Native mobile E2E (Android emulator + Maestro)

1. Build the debug APK: `cd apps/mobile && npx expo prebuild --platform android && cd android && ./gradlew app:assembleDebug -PreactNativeArchitectures=x86_64`
   (on Windows without long-path support the CMake paths of the pnpm store exceed 260 characters — build in
   the `reactnativecommunity/react-native-android` container or enable `LongPathsEnabled`).
2. Start the API (`NODE_ENV=test` disables rate limits) and Metro with `EXPO_PUBLIC_E2E=1` (hides dev
   warning banners) and `EXPO_PUBLIC_API_URL=http://10.0.2.2:4000`.
3. `adb reverse tcp:8081 tcp:8081 && adb reverse tcp:4000 tcp:4000`, install the APK, then
   `maestro test apps/mobile/.maestro/config.yaml apps/mobile/.maestro` (system language English).

CI runs the same flow in `.github/workflows/mobile.yml` (`maestro-android`).

### iOS builds and maps (open, needs accounts)

- **iOS** cannot be built on Windows. Use EAS Build: `npx eas login`, then
  `cd apps/mobile && npx eas build --platform ios --profile development` (profiles in `eas.json`; the
  `development` profile builds for the simulator). Installing on devices or TestFlight needs an Apple
  Developer account (`--profile preview` / `production`).
- **Android maps** need a Google Maps SDK key: set `android.config.googleMaps.apiKey` in
  `apps/mobile/app.json` (or inject it in an `app.config.ts` from an env var), then rebuild the native app.
  iOS uses Apple Maps and needs no key.

Conventions (TypeScript strict, Conventional Commits, feature folders, money as integer minor units, dates
through `@fp/domain/time`) are described in [docs/architecture.md](docs/architecture.md); decisions live in
[docs/adr](docs/adr).
