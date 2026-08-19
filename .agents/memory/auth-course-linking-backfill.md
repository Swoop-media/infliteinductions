---
name: Authorisation course linking backfill
description: Adding a course to an authorisation must backfill trainee course_assignments, or existing trainees hit a silent dead end
---
- Rule: any flow that links a course to an authorisation must also create trainee `course_assignments` rows for that authorisation's active trainees, and any auto-created assignment must gate on an explicit active-status allowlist (`assigned`, `in_progress`, `pending_approval`) — never a negative filter, because `expired` and `revoked` must stay locked out.
- **Why:** a course was added to an authorisation long after its trainees were assigned; those trainees had no assignment row and were redirected away with an error param the destination page never rendered — a silent dead end that blocked the onsite handoff.
- **How to apply:** when writing or reviewing assignment-creation flows (course-to-auth linking, learner-page self-heal), backfill only for active, non-archived trainees of a published course; `course_assignments.created_by` is NOT NULL and the unique key is (course_id,user_id,role), so upsert with ignoreDuplicates.

- Rule: completing a directly assigned course must not create an authorisation assignment automatically; a course may belong to multiple authorisations, so the intended authorisation is ambiguous. Completion logic may advance only an existing authorisation assignment.
- **Why:** two courses were assigned directly and completed, but their expected authorisations never appeared. One course belonged to both a base and a pilot authorisation, proving that course completion alone cannot safely infer which authorisation to grant.
- **How to apply:** assign the intended authorisation first (which assigns its required courses), or repair a genuinely missing authorisation assignment explicitly. Preserve any already-completed course rows when adding the authorisation.
