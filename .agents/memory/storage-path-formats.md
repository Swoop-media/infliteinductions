---
name: Storage path formats in learner_documents
description: file_path formats are inconsistent; any storage cleanup must match all forms and check the right bucket
---
# Storage path formats in learner_documents

Rule: `learner_documents.file_path` has THREE formats, and the path's first segment does NOT name its bucket: plain `<uid>/<file>` lives in the **learner-documents** bucket; legacy `learner-documents/<uid>/<file>` lives in the **course-files** bucket (under a literal `learner-documents/` folder — NOT in the learner-documents bucket despite the prefix); and `requirement-uploads/<assignment>/<req>/<file>` also lives in **course-files**. Any storage cleanup/integrity check must resolve each format to its real bucket.

**Why:** A cleanup audit once assumed the `learner-documents/...`-prefixed rows pointed into the learner-documents bucket and concluded those files had been deleted — they were safe in course-files the whole time. Rows can look "missing" in one bucket while alive in another. Supabase storage deletes are permanent (no undo), so misreading a path format during cleanup risks real loss.

**How to apply:** When auditing storage, verify a file's existence by trying its path (raw and prefix-stripped) against ALL buckets (`listBuckets` + `createSignedUrl` probe) before declaring it missing or stranded. Sweeps of the learner-documents bucket should still match both raw and prefixed file_path forms for safety, but prefixed rows' actual objects are in course-files.
