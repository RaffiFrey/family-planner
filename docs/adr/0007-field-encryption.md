# ADR-0007: Field-level encryption for sensitive identifiers

Status: accepted

IBANs (later: ID numbers, health data) are encrypted with AES-256-GCM (`FIELD_ENCRYPTION_KEY`, versioned
ciphertext `v1:`). Clients only ever receive the last four characters. Key rotation: add `v2` with a new key,
re-encrypt in a background job. In production the key comes from the cloud KMS/secret manager.
