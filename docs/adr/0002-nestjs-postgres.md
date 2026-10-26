# ADR-0002: NestJS modular monolith on PostgreSQL

Status: accepted

One deployable (API + worker entrypoints) with strict module boundaries keeps operations simple for a small
team; modules can be split out later. PostgreSQL via Drizzle (SQL-first, good for aggregations and RLS);
Redis for BullMQ, rate limits and the Socket.IO adapter. Fastify adapter for performance.
