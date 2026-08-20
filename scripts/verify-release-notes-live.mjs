/**
 * Exercises the release-note RLS policies in the configured Supabase project.
 *
 * This intentionally creates a disposable authenticated user and a draft
 * release note, then removes both in a finally block. It is guarded so it
 * cannot be run by accident:
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

let temporaryUserId;
let draftId;

try {
  const runId = randomUUID();
  const email = `release-notes-rls-${runId}@invalid.example`;
  const password = randomBytes(32).toString("base64url");

  const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createUserError || !createdUser.user) {
    failure(
      "Could not create the disposable General test account.",
      createUserError?.message
    );
  }
  temporaryUserId = createdUser.user.id;

  // Keep this session on a separate client so the admin client continues to
  // use its service-role JWT for setup and cleanup.
  const { data: signedIn, error: signInError } = await authenticator.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !signedIn.session?.access_token) {
    failure(
      "Could not authenticate the disposable General test account.",
      signInError?.message
    );
  }

  const { data: draft, error: createDraftError } = await admin
    .from("release_notes")
    .insert({
      title: `RLS verification draft ${runId}`,
      release_date: "2099-12-31",
      created_by: temporaryUserId,
    })
    .select("id")
    .single();
  if (createDraftError || !draft) {
    failure(
      "Could not create the disposable draft release note.",
      createDraftError?.message
    );
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

  // A service API key identifies the project; accessToken makes PostgREST
  // evaluate RLS with the temporary user's authenticated JWT instead.
  const generalUser = createClient(url, serviceRoleKey, {
    accessToken: async () => signedIn.session.access_token,
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithTimeout },
  });

  const hiddenDraft = await generalUser
    .from("release_notes")
    .select("id")
    .eq("id", draftId);
  assertNoRows(hiddenDraft, "draft release_notes", "read");

  const hiddenItem = await generalUser
    .from("release_note_items")
    .select("id")
    .eq("release_note_id", draftId);
  assertNoRows(hiddenItem, "draft release_note_items", "read");

  const noteInsert = await generalUser.from("release_notes").insert({
    title: `Unauthorised RLS verification ${runId}`,
    release_date: "2099-12-31",
    created_by: temporaryUserId,
  });
  assertWriteDenied(noteInsert, "release_notes", "insert into");

  const itemInsert = await generalUser.from("release_note_items").insert({
    release_note_id: draftId,
    order_index: 1,
    title: "Unauthorised RLS verification item",
    location: "Policy verification",
    details: "This write must be rejected.",
  });
  assertWriteDenied(itemInsert, "release_note_items", "insert into");

  const noteUpdate = await generalUser
    .from("release_notes")
    .update({ title: "Unauthorised change" })
    .eq("id", draftId)
    .select("id");
  assertNoRows(noteUpdate, "release_notes", "update");

  const itemUpdate = await generalUser
    .from("release_note_items")
    .update({ details: "Unauthorised change" })
    .eq("release_note_id", draftId)
    .select("id");
  assertNoRows(itemUpdate, "release_note_items", "update");

  const noteDelete = await generalUser
    .from("release_notes")
    .delete()
    .eq("id", draftId)
    .select("id");
  assertNoRows(noteDelete, "release_notes", "delete from");

  const itemDelete = await generalUser
    .from("release_note_items")
    .delete()
    .eq("release_note_id", draftId)
    .select("id");
  assertNoRows(itemDelete, "release_note_items", "delete from");

  console.log(
    "Release-note live policy check passed: a General user cannot read draft release notes or write either release-note table."
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (draftId) {
    const { error } = await admin.from("release_notes").delete().eq("id", draftId);
    if (error) {
      console.error(
        `Cleanup warning: the disposable release note could not be removed (${error.message}).`
      );
      process.exitCode = 1;
    }
  }
  if (temporaryUserId) {
    const errors = await cleanupDisposableUser(temporaryUserId);
    if (errors.length > 0) {
      console.error(
        `Cleanup warning: the disposable General test account could not be removed (${errors.join("; ")}).`
      );
      process.exitCode = 1;
    }
  }
}