// @ts-nocheck
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type OperationsNotice = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  department: string | null;
  tags: string[] | null;
  require_acknowledgement: boolean;
  responsible_person: string | null;
  valid_for_days: number | null;
  created_at: string;
  updated_at: string;
};

type NoticeAssignment = {
  id: string;
  notice_id: string;
  user_id: string;
  assigned_at: string;
  acknowledged_at: string | null;
};

async function loadPublishedNoticesForUser() {
  "use server";
  noStore();

  const supabase = await createSupabaseServer();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) redirect("/auth/login");

  const { data: assignments } = await supabase
    .from("operations_notice_assignments")
    .select("id, notice_id, user_id, assigned_at")
    .eq("user_id", user.id);

  const assignedNoticeIds = (assignments ?? []).map((a) => a.notice_id);

  const { data: notices } = await supabase
    .from("operations_notices")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const { data: acknowledgements } = await supabase
    .from("operations_notice_acknowledgements")
    .select("notice_id, user_id, acknowledged_at")
    .eq("user_id", user.id);

  const ackMap = new Map(
    (acknowledgements ?? []).map((a) => [a.notice_id, a.acknowledged_at])
  );

  const assignmentMap = new Map(
    (assignments ?? []).map((a) => [a.notice_id, a])
  );

  const { data: responsiblePersonProfiles } = await supabase
    .from("profiles")
    .select("id, full_name, email");

  const profileMap = new Map(
    (responsiblePersonProfiles ?? []).map((p) => [p.id, p])
  );

  const enrichedNotices = (notices ?? []).map((notice) => {
    const assignment = assignmentMap.get(notice.id);
    const isAssigned = !!assignment;
    const acknowledgedAt = ackMap.get(notice.id);
    const responsiblePerson = notice.responsible_person
      ? profileMap.get(notice.responsible_person)
      : null;

    let expiryDate: Date | null = null;
    let isExpired = false;
    if (notice.valid_for_days && notice.created_at) {
      expiryDate = new Date(notice.created_at);
      expiryDate.setDate(expiryDate.getDate() + notice.valid_for_days);
      isExpired = expiryDate < new Date();
    }

    return {
      ...notice,
      isAssigned,
      assignedAt: assignment?.assigned_at || null,
      acknowledgedAt: acknowledgedAt || null,
      responsiblePersonName: responsiblePerson?.full_name || null,
      expiryDate,
      isExpired,
    };
  });

  const validNotices = enrichedNotices.filter((n) => !n.isExpired);

  return { notices: validNotices, userId: user.id };
}

async function acknowledgeNotice(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const noticeId = String(formData.get("notice_id") || "");
  const userId = String(formData.get("user_id") || "");

  if (!noticeId || !userId) {
    throw new Error("Missing notice_id or user_id");
  }

  const { data: existing } = await supabase
    .from("operations_notice_acknowledgements")
    .select("id")
    .eq("notice_id", noticeId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase
      .from("operations_notice_acknowledgements")
      .insert({
        notice_id: noticeId,
        user_id: userId,
        acknowledged_at: new Date().toISOString(),
      });

    if (error) {
      console.error("Error acknowledging notice:", error);
      throw new Error("Failed to acknowledge notice");
    }
  }

  revalidatePath("/app/operations-notices");
}

export default async function OperationsNoticesPage() {
  const { notices, userId } = await loadPublishedNoticesForUser();

  const assignedNotices = notices.filter((n) => n.isAssigned);
  const unassignedNotices = notices.filter((n) => !n.isAssigned);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Operations Notices</h1>
          <p className="text-sm text-gray-600">
            View published operations notices and acknowledge those assigned to you.
          </p>
        </div>
      </div>

      {assignedNotices.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-orange-700">
            Assigned to You ({assignedNotices.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {assignedNotices.map((notice) => (
              <NoticeCard
                key={notice.id}
                notice={notice}
                userId={userId}
                isAssigned={true}
              />
            ))}
          </div>
        </section>
      )}

      {unassignedNotices.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-700">
            All Published Notices ({unassignedNotices.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {unassignedNotices.map((notice) => (
              <NoticeCard
                key={notice.id}
                notice={notice}
                userId={userId}
                isAssigned={false}
              />
            ))}
          </div>
        </section>
      )}

      {notices.length === 0 && (
        <div className="rounded-lg border bg-gray-50 p-8 text-center">
          <p className="text-gray-600">No published operations notices at this time.</p>
        </div>
      )}
    </div>
  );
}

function NoticeCard({
  notice,
  userId,
  isAssigned,
}: {
  notice: any;
  userId: string;
  isAssigned: boolean;
}) {
  const needsAcknowledgement =
    notice.require_acknowledgement && isAssigned && !notice.acknowledgedAt;
  const isAcknowledged = !!notice.acknowledgedAt;

  return (
    <div
      className={`rounded-xl border p-4 ${
        isAssigned
          ? needsAcknowledgement
            ? "border-orange-300 bg-orange-50"
            : "border-green-300 bg-green-50"
          : "bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{notice.title}</h3>
          {notice.department && (
            <span className="inline-block mt-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {notice.department}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {isAssigned && (
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                isAcknowledged
                  ? "bg-green-200 text-green-800"
                  : "bg-orange-200 text-orange-800"
              }`}
            >
              {isAcknowledged ? "Acknowledged" : "Pending"}
            </span>
          )}
          {notice.require_acknowledgement && (
            <span className="text-xs text-gray-500">Requires acknowledgement</span>
          )}
        </div>
      </div>

      {notice.description && (
        <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
          {notice.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
        {notice.responsiblePersonName && (
          <span>Responsible: {notice.responsiblePersonName}</span>
        )}
        {notice.expiryDate && (
          <span>Expires: {new Date(notice.expiryDate).toLocaleDateString()}</span>
        )}
        {notice.tags && notice.tags.length > 0 && (
          <div className="flex gap-1">
            {notice.tags.map((tag: string) => (
              <span
                key={tag}
                className="rounded bg-gray-100 px-1.5 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {isAssigned && notice.assignedAt && (
        <p className="mt-2 text-xs text-gray-500">
          Assigned: {new Date(notice.assignedAt).toLocaleDateString()}
          {isAcknowledged &&
            notice.acknowledgedAt &&
            ` | Acknowledged: ${new Date(notice.acknowledgedAt).toLocaleDateString()}`}
        </p>
      )}

      {needsAcknowledgement && (
        <form action={acknowledgeNotice} className="mt-3">
          <input type="hidden" name="notice_id" value={notice.id} />
          <input type="hidden" name="user_id" value={userId} />
          <button
            type="submit"
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            Acknowledge
          </button>
        </form>
      )}
    </div>
  );
}
