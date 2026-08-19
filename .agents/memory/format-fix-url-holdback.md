---
name: Format-fix URL holdback
description: Unplayable format-fix video uploads must not be visible to learners while converting
---
Format-fix uploads (mislabelled .webm etc.) are unplayable, so the video block's URL is held back: upload-complete writes url:null + a pending_format_fix marker on the block BEFORE inserting the job row, and the worker populates the .mp4 URL (clearing the marker) on completion, or clears the marker on permanent failure.

**Why:** the source file cannot play in browsers; pointing the block at it during the conversion window shows learners a broken player. Write ordering (marker committed before the job is claimable) prevents a fast worker from completing before the marker exists.

**How to apply:**
- Every learner/preview video renderer must treat "no url + pending_format_fix" as a "video processing" placeholder — there are ~7 render surfaces (learn courses/modules pages, contractor/visitor components, CoursePreview, ContractorModuleRenderer).
- enqueueVideoCompression returns 'queued' | 'already_active' | 'failed'; 'already_active' (e.g. retried upload-complete) must KEEP the hold — only 'failed' rolls the block back to the original URL.
