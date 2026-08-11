---
name: Uploaded video format compatibility
description: Why "This video couldn't be played on this device" happens and how uploads/remediation guard against it
---

# Uploaded video format compatibility

Rule: uploaded course videos must be H.264 MP4 (or real VP8/VP9 WebM). Extension checks are not enough — screen recorders (e.g. browser MediaRecorder tools) produce `.webm` files that actually contain **H.264 in a Matroska container** ("V_MPEG4/ISO/AVC"), which iOS Safari/WebKit cannot play; `.mov` files can carry PCM audio which also breaks playback.

**Why:** An Aug 2026 audit of all 38 uploaded video blocks found 8 such fake-webm files and 1 mov/pcm file — all reported as "couldn't be played on this device" on mobile. Remediated by remuxing (`ffmpeg -c:v copy -c:a aac -movflags +faststart`) to new MP4s in the same storage folder and repointing the block `data.url`.

**How to apply:** Upload policy is enforced in three places that must stay consistent: `/api/upload-signed-url` (ext allowlist mp4/m4v/webm), `/api/upload-complete` (byte-level sniff of container/codec, rejects fake webm & HEVC), and the video upload UI accept list. Player media errors are POSTed to `/api/video-playback-error` and appear in server logs as `[video-playback-error]` with MediaError code — check there first for future playback reports. ffmpeg/ffprobe are available in the workspace and can probe Supabase signed URLs directly.
