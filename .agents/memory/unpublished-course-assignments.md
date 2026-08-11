---
name: Unpublished course assignments
description: Why learner assignments to draft courses exist despite UI filtering, and the guardrails in place
---

The assignment UIs only list published courses, yet many trainee assignments point at unpublished (draft) courses — mostly because courses were unpublished *after* learners were assigned, or via routes that derive course lists indirectly (e.g. bulk authorisation assignment).

**Why:** Draft-course content (quizzes especially) is intentionally hidden from learners, so these assignments surface as broken quizzes and are only caught via user bug reports.

**How to apply:** Any code path that writes trainee course assignments — including indirect ones (authorisation-derived, user creation, enrolment approval, retakes, bulk flows) — must verify each course is published server-side; client-side filtering is not enough (stale pages, indirect course lists). Treat missing course rows in batch status checks as a failure, not an implicit pass.
