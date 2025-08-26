"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type DbStatus =
  | "pending"
  | "approved"
  | "in_progress"
  | "completed"
  | "rejected"
  | "cancelled";

type UiStatus = "none" | "pending" | "enrolled";

function toUiStatus(s: DbStatus | null | undefined): UiStatus {
  if (!s || s === "rejected" || s === "cancelled") return "none";
  if (s === "pending") return "pending";
  // approved, in_progress, completed
  return "enrolled";
}

export default function CourseEnrolButton({
  courseId,
  initialStatus,
}: {
  courseId: string;
  /** Optional DB status you already looked up server-side */
  initialStatus?: DbStatus | null;
}) {
  const [ui, setUi] = useState<UiStatus>(toUiStatus(initialStatus ?? null));

  useEffect(() => {
    let unsub: (() => void) | null = null;

    (async () => {
      // 1) Who am I?
      const { data: ud } = await supabaseBrowser.auth.getUser();
      const uid = ud.user?.id ?? null;
      if (!uid) {
        setUi("none");
        return;
      }

      // 2) Fetch current DB status (covers page loads with an existing row)
      const { data: existing } = await supabaseBrowser
        .from("course_enrolments")
        .select("status")
        .eq("user_id", uid)
        .eq("course_id", courseId)
        .maybeSingle();

      setUi(toUiStatus((existing?.status as DbStatus | undefined) ?? null));

      // 3) Realtime: reflect changes made by admins
      const channel = supabaseBrowser
        .channel(`enrol-${courseId}-${uid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "course_enrolments",
            filter: `user_id=eq.${uid}`,
          },
          (payload: any) => {
            console.log("CourseEnrolButton realtime update:", {
              event: payload.eventType,
              courseId,
              userId: uid,
              payload
            });
            
            const row =
              (payload.new || payload.old) as {
                user_id: string;
                course_id: string;
                status: DbStatus;
              };
            if (row && row.course_id === courseId) {
              console.log("Updating UI status from realtime:", {
                oldStatus: row.status,
                newUiStatus: toUiStatus(row.status)
              });
              setUi(toUiStatus(row.status));
            }
          }
        )
        .subscribe();

      // Set up periodic refresh in case realtime misses updates
      const refreshInterval = setInterval(async () => {
        const { data: refreshed } = await supabaseBrowser
          .from("course_enrolments")
          .select("status")
          .eq("user_id", uid)
          .eq("course_id", courseId)
          .maybeSingle();
        
        const currentStatus = toUiStatus((refreshed?.status as DbStatus | undefined) ?? null);
        setUi(currentStatus);
        console.log("CourseEnrolButton periodic refresh:", {
          courseId,
          userId: uid,
          status: refreshed?.status,
          uiStatus: currentStatus
        });
      }, 5000); // Check every 5 seconds

      unsub = () => {
        channel.unsubscribe();
        clearInterval(refreshInterval);
      };
    })();

    return () => {
      if (unsub) unsub();
    };
  }, [courseId]);

  // UI
  if (ui === "pending") {
    return (
      <button
        disabled
        className="rounded-md bg-yellow-500 px-3 py-1 text-sm text-white cursor-not-allowed"
      >
        Requested
      </button>
    );
  }

  if (ui === "enrolled") {
    return (
      <button
        disabled
        className="rounded-md bg-green-600 px-3 py-1 text-sm text-white cursor-not-allowed"
      >
        Enrolled
      </button>
    );
  }

  // No enrolment row yet
  return (
    <form action="/app/courses/enrol" method="post">
      <input type="hidden" name="course_id" value={courseId} />
      <button className="rounded-md bg-black px-3 py-1 text-sm text-white">
        Enrol
      </button>
    </form>
  );
}
