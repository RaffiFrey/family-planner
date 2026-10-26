# ADR-0010: Customer-granted support access

Status: accepted

Support staff never see household internals by default. An owner/admin can grant time-boxed access
(1-72 h, optional reason) in the household settings; it can be revoked any time. While a grant is active the
admin console offers an extended support view (members, devices, recent action names, failed uploads) — still
without finance, document or message contents. Every view is written to `staff_audit_log` and the grant/revoke to
the household audit log, so the family can see who granted access and when.
