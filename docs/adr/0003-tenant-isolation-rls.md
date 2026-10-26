# ADR-0003: Tenant isolation with row-level security

Status: accepted

Every tenant table has `household_id` and an RLS policy `household_id = current_setting('app.household_id')`
for the runtime role `fp_app`. Request handling always runs in `withTenant`. Auth, workers and admin use
`fp_system` (BYPASSRLS) with explicit filters. `fp_app` has no access to auth/staff tables. Integration
tests assert that `fp_app` sees nothing without a tenant and nothing of other tenants.
