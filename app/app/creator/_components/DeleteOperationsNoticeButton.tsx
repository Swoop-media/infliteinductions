// @ts-nocheck
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteOperationsNoticeButton({
  noticeId,
  title,
}: {
  noticeId: string;
  title?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleDelete = async () => {
    const confirmed = confirm(
      `Are you sure you want to delete "${title || "this notice"}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    setPending(true);
    try {
      const res = await fetch(`/app/creator/operations-notices/${noticeId}/delete`, {
        method: "POST",
      });
      if (res.ok) {
        router.push("/app/creator?tab=operations-notices&ok=notice_deleted");
        router.refresh();
      } else {
        alert("Failed to delete notice");
      }
    } catch (e) {
      alert("An error occurred");
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      className="rounded-md border px-3 py-1.5 text-sm border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
    >
      {pending ? "Deleting..." : "Delete"}
    </button>
  );
}
