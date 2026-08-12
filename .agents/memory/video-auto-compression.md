---
name: Video auto-compression decisions
description: Durable decisions behind the background re-encode of oversized module videos
---
- Client-supplied storage paths in upload-completion flows are an authorization surface: any privileged operation (size check, sniff, delete, queue) must first bind the path to the module being modified (`module-<type>/<moduleId>/<uuid>.<ext>`), and the background worker re-checks the same invariant. **Why:** service-role workers will happily overwrite another course's object if a creator passes a foreign path.
- Compression must never block or fail an upload — enqueue degrades to a logged no-op (e.g. when the queue table migration hasn't been applied yet).
- Encode settings should stay consistent with the proven batch scripts (1080p H.264 CRF23 AAC +faststart); `.webm` sources are replaced at a sibling `.mp4` path with the block repointed, never mp4 bytes under a `.webm` path.
