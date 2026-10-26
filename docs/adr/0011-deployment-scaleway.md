# ADR-0011: Deployment on Scaleway (EU) with Terraform

Status: accepted

Production runs in a Scaleway EU region (default fr-par): managed PostgreSQL 17 (HA, encrypted, PITR backups in
another region), managed Redis (TLS), Object Storage (private, versioned, CORS for the web origin, exports expire
after 7 days) and Serverless Containers for api, worker, web and admin in a private network. Everything is
described in `infra/terraform/scaleway` (validated in CI). The same Docker images run locally via
`infra/docker`. Migrations run as a one-off job of the api image (`node node_modules/@fp/db/dist/migrate.js`)
before a rollout.
