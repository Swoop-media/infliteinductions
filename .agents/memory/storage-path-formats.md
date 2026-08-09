---
name: Storage path formats in learner_documents
description: file_path formats are inconsistent; any storage cleanup must match all forms and check the right bucket
---
# Storage path formats in learner_documents

Rule: `learner_documents.file_path` has THREE formats: plain `<uid>/<file>` (learner-documents bucket), legacy `learner-documents/<uid>/<file>` (same bucket, bucket-name prefixed), and `requirement-uploads/<assignment>/<req>/<file>` — which lives in the **course-files** bucket, not a "requirement-uploads" bucket. Any storage cleanup/integrity check must normalize the prefixed form and look in the correct bucket per format.

**Why:** The automatic document sweep once matched storage paths against file_path exactly; legacy prefix-format rows didn't match and their referenced files were wrongly deleted (unrecoverable — storage deletes have no undo). Rows with requirement-upload paths can also look "missing" if checked against the wrong bucket while actually being safe in course-files.

**How to apply:** When auditing or deleting storage objects, build the referenced set from file_path with the bucket prefix stripped, and never assume the path's first segment names its bucket. Supabase storage deletes are permanent — always dry-run and cross-check every path format first.
