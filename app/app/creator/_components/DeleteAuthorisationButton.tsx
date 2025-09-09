// @ts-nocheck
// app/app/creator/_components/DeleteAuthorisationButton.tsx
"use client";

export default function DeleteAuthorisationButton({
  authId,
  title,
}: {
  authId: string;
  title?: string | null;
}) {
  return (
    <form
      action="/app/creator/authorisations/delete"
      method="post"
      onSubmit={(e) => {
        const name = title || "Authorisation";
        if (!confirm(`Delete “${name}”? This cannot be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={authId} />
      <button
        className="rounded-md border px-3 py-1.5 text-sm border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
        type="submit"
      >
        Delete
      </button>
    </form>
  );
}
