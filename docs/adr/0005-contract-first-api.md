# ADR-0005: Contract-first API with Zod (instead of OpenAPI codegen)

Status: accepted — deviates from the plan's orval/nestjs-zod idea

Endpoints are declared as data in `@fp/contracts` (method, path, Zod schemas). The API binds handlers with
`@Endpoint()` (validation in, validation/stripping out), `generateOpenApi()` produces OpenAPI 3.1 from the
same contracts (served at `/openapi.json`), and `createClient()` derives a fully typed client by inference.
No generated code to keep in sync; nestjs-zod did not support Nest 12 at the time.
