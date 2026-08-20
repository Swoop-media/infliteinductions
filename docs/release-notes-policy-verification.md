# Release-note policy verification

Run this check after applying `app/migrations/033_release_notes.sql` and before
approving a release that changes the release-note schema or permissions. It
guards against the old permissive `rn_select_all_auth` policy (and any other
unexpected policy) making drafts visible to General users.

## Required live check

From the project environment with the Supabase URL and service-role secret
available, run:

```sh
RELEASE_NOTES_LIVE_CHECK=1 pnpm verify:release-notes-live
```

The command is deliberately guarded by `RELEASE_NOTES_LIVE_CHECK=1`. It creates
a disposable authenticated user with no application role, a draft release note,
and one draft item. It then proves that user cannot read either draft row or
insert, update, or delete either release-note table. It removes the temporary
draft and the exact user created by that invocation in a `finally` block. If
cleanup is incomplete, the command fails rather than reporting a successful
release gate.

A failure that says a General user could read a draft indicates an unsafe
permissive `SELECT` policy. A failure that says the user could write identifies
the relevant unsafe operation. Do not approve the release until the policy is
fixed and this check passes.

## Policy manifest check in Supabase

The live command exercises access behavior. Also run
`scripts/verify-release-notes-policies.sql` in the **configured Supabase
project's SQL editor**. The SQL check:

- confirms RLS is enabled on both tables;
- requires exactly the eight managed policy names and operations;
- creates draft rows inside a transaction, exercises a real non-Admin account,
  and rolls everything back;
- fails with the unexpected policy names if a legacy permissive policy remains.

The SQL check needs at least one non-Admin account in the project. It does not
retain test data because it always ends with `ROLLBACK`.

## Local migration regression test

The live checks complement—not replace—the local migration test:

```sh
pnpm test:release-notes-db
```

That test applies the real migration twice in a temporary PostgreSQL cluster,
including an injected legacy `rn_select_all_auth` policy, and verifies the
migration removes it.