# ADR-0008: Separate staff realm, privacy by design

Status: accepted

The admin console authenticates staff separately (argon2id passwords, mandatory TOTP, opaque bearer tokens
stored hashed, 8h sessions, login throttling) and is never reachable with a customer session. Roles: support,
billing, ops, superadmin. Every mutating admin action requires a reason and is written to
`staff_audit_log`. Support views show counts and metadata only — never finance or document contents.
Consent-based, time-boxed support access is a planned extension.
