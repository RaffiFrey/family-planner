# ADR-0009: Direct-to-storage uploads

Status: accepted

Clients upload with presigned PUT URLs (the API never streams bytes); quota is reserved on ticket creation,
confirmed with HEAD on completion, then a worker scans (ClamAV, optional) and creates WebP thumbnails.
Locally SeaweedFS replaces MinIO (no longer published on Docker Hub). The AWS SDK must use
`requestChecksumCalculation: WHEN_REQUIRED`, otherwise presigned URLs embed a checksum of an empty body.
