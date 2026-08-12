---
name: Large storage batch jobs
description: Durable lessons for long re-encode/upload batches against Supabase storage in this workspace
---
- Long batch jobs must run as a console workflow — plain `nohup`/`setsid` background processes are reaped when the shell session ends.
- `/tmp` is wiped when the VM restarts mid-batch; keep progress state (file list, report, log) in the workspace and make the batch resume from that report.
- supabase-js `.upload()` with a large (>~200 MB) Buffer fails with a bare "fetch failed"; use `createSignedUploadUrl` + a streamed PUT with retries instead.
- Restarting a batch workflow can leave the old process alive → two instances clobbering shared temp files; use pid-unique temp names and check `ps` before restarting.
- Storage `updated_at` distinguishes replaced objects from originals; a cutoff timestamp makes re-scans idempotent.
- Never leave MP4 bytes under a `.webm` path: the file proxy picks Content-Type by extension and iOS rejects mislabeled webm; migrate the object to a `.mp4` path and update referencing blocks.
