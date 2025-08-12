"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Status = "none" | "pending" | "approved" | "completed";

export default function CourseEnrolButton({
  courseId,
  initialStatus,
}: {
  courseId: string;
  initialStatus?: "pending" | "approved" | "completed" | null;
}) {
  const [status, setStatus] = useState<Status>(
    (initialStatus as Status) || "none"
  );
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    (async () => {
      const { data: ud } = await supabaseBrowser.auth.getUser();
      const uid = ud.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;

      // Listen for INSERT/UPDATE on this user's enrolment for this course
      const channel = supabaseBrowser
        .channel(`enrol-${courseId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "course_enrolments",
            filter: `user_id=eq.${uid}`,
          },
          (payload: any) => {
            const row = (payload.new || payload.old) as {
              user_id: string;
              course_id: string;
              status: Status;
            };
            if (row && row.course_id === courseId) {
              setStatus(row.status as Status);
            }
          }
        )
        .subscribe();

      unsub = () => channel.unsubscribe();
    })();

    return () => {
      if (unsub) unsub();
    };
  }, [courseId]);

  // UI styles/labels
  if (status === "pending") {
    return (
      <button
        disabled
        className="rounded-md bg-yellow-500 px-3 py-1 text-sm text-white cursor-not-allowed"
      >
        Requested
      </button>
    );
  }
  if (status === "approved" || status === "completed") {
    return (
      <button
        disabled
        className="rounded-md bg-green-600 px-3 py-1 text-sm text-white cursor-not-allowed"
      >
        Enrolled
      </button>
    );
  }

  // No existing enrolment: show the form to create one
  return (
    <form action="/app/courses/enrol" method="post">
      <input type="hidden" name="course_id" value={courseId} />
      <button className="rounded-md bg-black px-3 py-1 text-sm text-white">
        Enrol
      </button>
    </form>
  );
}
