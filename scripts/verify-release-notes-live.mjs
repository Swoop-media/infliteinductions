/**
 * Exercises the release-note RLS policies and RPCs in the configured Supabase project.
 *
 * This intentionally creates disposable authenticated users, draft/published
 * release notes, then removes all of them in a finally block. It is guarded
 * so it cannot be run by accident:
 *
 *   RELEASE_NOTES_LIVE_CHECK=1 pnpm verify:release-notes-live
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const checkEnabled = process.env.RELEASE_NOTES_LIVE_CHECK === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const timeoutMs = 15_000;

function failure(message, detail) {
  const suffix = detail ? ` ${detail}` : "";
  throw new Error(`Release-note live policy check failed: ${message}${suffix}`);
}

function fetchWithTimeout(input, init = {}) {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}

function isWriteDenied(error) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`;
  return error?.code === "42501"
    || /row-level security|permission denied|only draft release notes can be changed/i.test(message);
}

function assertWriteDenied(result, table, operation) {
  if (!result.error || !isWriteDenied(result.error)) {
    const detail = result.error
      ? `Received ${result.error.code ?? "an unexpected error"}: ${result.error.message}`
      : "The request succeeded.";
    failure(
      `A General user could ${operation} ${table}. Check for a permissive ${operation} policy.`,
      detail
    );
  }
}

function assertNoRows(result, table, operation) {
  if (result.error) {
    failure(
      `Could not verify that a General user cannot ${operation} ${table}.`,
      `${result.error.code ?? "unknown"}: ${result.error.message}`
    );
  }
  if ((result.data ?? []).length !== 0) {
    failure(
      `A General user could ${operation} ${table}. Check for a permissive ${operation} policy.`
    );
  }
}

function assertSingleRow(result, table, operation) {
  if (result.error) {
    failure(
      `A General user was unexpectedly blocked from ${operation} ${table}.`,
      `${result.error.code ?? "unknown"}: ${result.error.message}`
    );
  }
  if ((result.data ?? []).length !== 1) {
    failure(
      `Expected exactly one row after ${operation} ${table}, got ${(result.data ?? []).length}.`
    );
  }
}

if (!checkEnabled) {
  console.error(
    "Refusing to run a live database check. Re-run with RELEASE_NOTES_LIVE_CHECK=1."
  );
  process.exit(2);
}

if (!url || !serviceRoleKey) {
  console.error(
    "Release-note live policy check needs NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(2);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: fetchWithTimeout },
});
const authenticator = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: fetchWithTimeout },
});

async function cleanupDisposableUser(userId) {
  const errors = [];
  const dependents = [
    ["release_note_reads", "user_id"],
    ["user_roles", "user_id"],
    ["profiles", "id"],
  ];

  // Supabase's signup trigger creates profile and default-role rows. Their
  // foreign keys block auth.admin.deleteUser unless they are removed first.
  for (const [table, column] of dependents) {
    const { error } = await admin.from(table).delete().eq(column, userId);
    if (error) errors.push(`${table}.${column}: ${error.message}`);
  }

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
  if (deleteUserError) errors.push(`auth.users: ${deleteUserError.message}`);
  return errors;
}

let temporaryUserOneId;
let temporaryUserTwoId;
let draftId;
let publishedId;

try {
  const runId = randomUUID();

  // ------------------------------------------------------------------
  // Create two disposable general users (no Admin role).
  // ------------------------------------------------------------------
  const emailOne = `release-notes-rls-${runId}-a@invalid.example`;
  const emailTwo = `release-notes-rls-${runId}-b@invalid.example`;
  const password = randomBytes(32).toString("base64url");

  const { data: createdUserOne, error: createUserOneError } =
    await admin.auth.admin.createUser({ email: emailOne, password, email_confirm: true });
  if (createUserOneError || !createdUserOne.user) {
    failure("Could not create disposable General test account A.", createUserOneError?.message);
  }
  temporaryUserOneId = createdUserOne.user.id;

  const { data: createdUserTwo, error: createUserTwoError } =
    await admin.auth.admin.createUser({ email: emailTwo, password, email_confirm: true });
  if (createUserTwoError || !createdUserTwo.user) {
    failure("Could not create disposable General test account B.", createUserTwoError?.message);
  }
  temporaryUserTwoId = createdUserTwo.user.id;

  // Sign in both users and keep their sessions.
  const { data: signedInOne, error: signInOneError } =
    await authenticator.auth.signInWithPassword({ email: emailOne, password });
  if (signInOneError || !signedInOne.session?.access_token) {
    failure("Could not authenticate disposable General test account A.", signInOneError?.message);
  }

  const { data: signedInTwo, error: signInTwoError } =
    await authenticator.auth.signInWithPassword({ email: emailTwo, password });
  if (signInTwoError || !signedInTwo.session?.access_token) {
    failure("Could not authenticate disposable General test account B.", signInTwoError?.message);
  }

  // ------------------------------------------------------------------
  // Seed a draft release note and one item (as service role).
  // ------------------------------------------------------------------
  const { data: draft, error: createDraftError } = await admin
    .from("release_notes")
    .insert({
      title: `RLS verification draft ${runId}`,
      release_date: "2099-12-31",
      created_by: temporaryUserOneId,
    })
    .select("id")
    .single();
  if (createDraftError || !draft) {
    failure("Could not create the disposable draft release note.", createDraftError?.message);
  }
  draftId = draft.id;

  const { error: createItemError } = await admin.from("release_note_items").insert({
    release_note_id: draftId,
    order_index: 0,
    title: "RLS verification item",
    location: "Policy verification",
    details: "This draft is created only to prove General-user access is denied.",
  });
  if (createItemError) {
    failure("Could not create the disposable draft item.", createItemError.message);
  }

  // ------------------------------------------------------------------
  // Seed a published release note (insert as draft, add item, publish).
  // ------------------------------------------------------------------
  const { data: published, error: createPublishedError } = await admin
    .from("release_notes")
    .insert({
      title: `RLS verification published ${runId}`,
      release_date: "2099-12-31",
      created_by: temporaryUserOneId,
    })
    .select("id")
    .single();
  if (createPublishedError || !published) {
    failure("Could not create the disposable published release note.", createPublishedError?.message);
  }
  publishedId = published.id;

  const { error: pubItemError } = await admin.from("release_note_items").insert({
    release_note_id: publishedId,
    order_index: 0,
    title: "Published RLS verification item",
    location: "Policy verification",
    details: "Exists to satisfy the publish constraint.",
  });
  if (pubItemError) {
    failure("Could not create the item for the published note.", pubItemError.message);
  }

  // Publish via service role — triggers set published_at.
  const { data: publishedRow, error: publishError } = await admin
    .from("release_notes")
    .update({ status: "published" })
    .eq("id", publishedId)
    .select("published_at")
    .single();
  if (publishError || !publishedRow?.published_at) {
    failure("Could not publish the disposable release note.", publishError?.message);
  }
  const publishedAt = publishedRow.published_at;

  // ------------------------------------------------------------------
  // Build RLS-scoped clients for each general user.
  // ------------------------------------------------------------------
  const generalUserOne = createClient(url, serviceRoleKey, {
    accessToken: async () => signedInOne.session.access_token,
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithTimeout },
  });

  const generalUserTwo = createClient(url, serviceRoleKey, {
    accessToken: async () => signedInTwo.session.access_token,
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithTimeout },
  });

  // ------------------------------------------------------------------
  // 1. Draft visibility: general users cannot see draft notes or items.
  // ------------------------------------------------------------------
  const hiddenDraft = await generalUserOne
    .from("release_notes")
    .select("id")
    .eq("id", draftId);
  assertNoRows(hiddenDraft, "draft release_notes", "read");

  const hiddenItem = await generalUserOne
    .from("release_note_items")
    .select("id")
    .eq("release_note_id", draftId);
  assertNoRows(hiddenItem, "draft release_note_items", "read");

  // ------------------------------------------------------------------
  // 2. General users cannot write release_notes or release_note_items.
  // ------------------------------------------------------------------
  const noteInsert = await generalUserOne.from("release_notes").insert({
    title: `Unauthorised RLS verification ${runId}`,
    release_date: "2099-12-31",
    created_by: temporaryUserOneId,
  });
  assertWriteDenied(noteInsert, "release_notes", "insert into");

  const itemInsert = await generalUserOne.from("release_note_items").insert({
    release_note_id: draftId,
    order_index: 1,
    title: "Unauthorised RLS verification item",
    location: "Policy verification",
    details: "This write must be rejected.",
  });
  assertWriteDenied(itemInsert, "release_note_items", "insert into");

  const noteUpdate = await generalUserOne
    .from("release_notes")
    .update({ title: "Unauthorised change" })
    .eq("id", draftId)
    .select("id");
  assertNoRows(noteUpdate, "release_notes", "update");

  const itemUpdate = await generalUserOne
    .from("release_note_items")
    .update({ details: "Unauthorised change" })
    .eq("release_note_id", draftId)
    .select("id");
  assertNoRows(itemUpdate, "release_note_items", "update");

  const noteDelete = await generalUserOne
    .from("release_notes")
    .delete()
    .eq("id", draftId)
    .select("id");
  assertNoRows(noteDelete, "release_notes", "delete from");

  const itemDelete = await generalUserOne
    .from("release_note_items")
    .delete()
    .eq("release_note_id", draftId)
    .select("id");
  assertNoRows(itemDelete, "release_note_items", "delete from");

  // ------------------------------------------------------------------
  // 3. Unread count: published note appears unread before any receipt.
  // ------------------------------------------------------------------
  const { data: unreadBefore, error: unreadBeforeError } = await generalUserOne
    .rpc("get_unread_release_note_count");
  if (unreadBeforeError) {
    failure("get_unread_release_note_count() failed before any receipt.", unreadBeforeError.message);
  }
  if (typeof unreadBefore !== "number" || unreadBefore < 1) {
    failure(
      `get_unread_release_note_count() returned ${unreadBefore} before any receipt (expected >= 1).`
    );
  }

  // ------------------------------------------------------------------
  // 4. Stale published_at must be rejected by mark_release_notes_read.
  // ------------------------------------------------------------------
  const stalePublishedAt = new Date(new Date(publishedAt).getTime() - 1000).toISOString();
  const { data: staleCount, error: staleMarkError } = await generalUserOne
    .rpc("mark_release_notes_read", {
      expected_releases: [{ id: publishedId, published_at: stalePublishedAt }],
    });
  if (staleMarkError) {
    failure("mark_release_notes_read() errored on a stale published_at.", staleMarkError.message);
  }
  if (staleCount !== 0) {
    failure(
      `mark_release_notes_read() accepted a stale published_at (returned ${staleCount}, expected 0).`
    );
  }

  // Confirm no receipt was created.
  const noReceiptYet = await generalUserOne
    .from("release_note_reads")
    .select("release_note_id")
    .eq("release_note_id", publishedId)
    .eq("user_id", temporaryUserOneId);
  assertNoRows(noReceiptYet, "release_note_reads", "read after stale mark attempt");

  // ------------------------------------------------------------------
  // 5. Correct published_at must be accepted.
  // ------------------------------------------------------------------
  const { data: markCount, error: markError } = await generalUserOne
    .rpc("mark_release_notes_read", {
      expected_releases: [{ id: publishedId, published_at: publishedAt }],
    });
  if (markError) {
    failure("mark_release_notes_read() errored on a correct published_at.", markError.message);
  }
  if (markCount !== 1) {
    failure(
      `mark_release_notes_read() with correct published_at returned ${markCount} (expected 1).`
    );
  }

  // User one can read their own receipt.
  const ownReadSelect = await generalUserOne
    .from("release_note_reads")
    .select("release_note_id, user_id, read_published_at")
    .eq("release_note_id", publishedId)
    .eq("user_id", temporaryUserOneId);
  assertSingleRow(ownReadSelect, "release_note_reads", "select own");
  if (ownReadSelect.data[0].read_published_at !== publishedAt) {
    failure(
      `read_published_at mismatch: stored ${ownReadSelect.data[0].read_published_at}, expected ${publishedAt}.`
    );
  }

  // ------------------------------------------------------------------
  // 6. Read-state privacy: user two cannot see user one's read receipt.
  // ------------------------------------------------------------------
  const crossUserSelect = await generalUserTwo
    .from("release_note_reads")
    .select("release_note_id, user_id")
    .eq("release_note_id", publishedId)
    .eq("user_id", temporaryUserOneId);
  assertNoRows(crossUserSelect, "release_note_reads (another user's row)", "read");

  // ------------------------------------------------------------------
  // 7. User two cannot insert a read receipt claiming to be user one.
  // ------------------------------------------------------------------
  const crossUserInsert = await generalUserTwo.from("release_note_reads").insert({
    release_note_id: publishedId,
    user_id: temporaryUserOneId,
    read_published_at: publishedAt,
  });
  assertWriteDenied(crossUserInsert, "release_note_reads", "insert (impersonating another user) into");

  // ------------------------------------------------------------------
  // 8. No user can insert a read receipt for a draft note.
  // ------------------------------------------------------------------
  const draftReadInsert = await generalUserOne.from("release_note_reads").insert({
    release_note_id: draftId,
    user_id: temporaryUserOneId,
    read_published_at: new Date().toISOString(),
  });
  assertWriteDenied(draftReadInsert, "release_note_reads", "insert (draft note) into");

  // ------------------------------------------------------------------
  // 9. A direct insert with wrong published_at must be rejected by RLS.
  // ------------------------------------------------------------------
  const wrongPublishedAtInsert = await generalUserTwo.from("release_note_reads").insert({
    release_note_id: publishedId,
    user_id: temporaryUserTwoId,
    read_published_at: stalePublishedAt,
  });
  assertWriteDenied(
    wrongPublishedAtInsert,
    "release_note_reads",
    "insert (wrong read_published_at) into"
  );

  console.log(
    "Release-note live policy check passed: " +
    "draft visibility, write denial, unread count RPC, stale mark rejection, " +
    "correct mark acceptance, read_published_at verification, read-state privacy, " +
    "and draft-note read rejection all verified."
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  // Clean up published note first (items and receipts cascade).
  if (publishedId) {
    const { error } = await admin.from("release_notes").delete().eq("id", publishedId);
    if (error) {
      console.error(
        `Cleanup warning: the disposable published release note could not be removed (${error.message}).`
      );
      process.exitCode = 1;
    }
  }
  if (draftId) {
    const { error } = await admin.from("release_notes").delete().eq("id", draftId);
    if (error) {
      console.error(
        `Cleanup warning: the disposable draft release note could not be removed (${error.message}).`
      );
      process.exitCode = 1;
    }
  }
  if (temporaryUserOneId) {
    const errors = await cleanupDisposableUser(temporaryUserOneId);
    if (errors.length > 0) {
      console.error(
        `Cleanup warning: disposable General test account A could not be removed (${errors.join("; ")}).`
      );
      process.exitCode = 1;
    }
  }
  if (temporaryUserTwoId) {
    const errors = await cleanupDisposableUser(temporaryUserTwoId);
    if (errors.length > 0) {
      console.error(
        `Cleanup warning: disposable General test account B could not be removed (${errors.join("; ")}).`
      );
      process.exitCode = 1;
    }
  }
}
