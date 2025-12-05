// @ts-nocheck
"use client";

import dynamic from 'next/dynamic';

const NoticeRichDescriptionEditor = dynamic(
  () => import('./NoticeRichDescriptionEditor'),
  {
    ssr: false,
    loading: () => <div className="border rounded-md p-3 min-h-[200px] bg-gray-50 animate-pulse" />,
  }
);

type NoticeRow = {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  require_acknowledgement: boolean;
  department: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  responsible_person: string | null;
  valid_for_days: number | null;
};

type ResponsiblePerson = {
  id: string;
  name: string;
  email: string;
  role: string;
};

interface DetailsTabClientProps {
  notice: NoticeRow;
  allDepartments: string[];
  responsiblePersons: ResponsiblePerson[];
  updateNoticeDetails: (formData: FormData) => Promise<void>;
  updateNoticeDescription: (formData: FormData) => Promise<void>;
  updateNoticeStatusAction: (formData: FormData) => Promise<void>;
  buildNoticeUrl: (noticeId: string, tab?: "details" | "assignments", notice?: string) => string;
}

export default function DetailsTabClient({
  notice,
  allDepartments,
  responsiblePersons,
  updateNoticeDetails,
  updateNoticeDescription,
  updateNoticeStatusAction,
  buildNoticeUrl,
}: DetailsTabClientProps) {
  const tagsCsv = Array.isArray(notice.tags) ? (notice.tags as string[]).join(", ") : "";

  return (
    <div className="space-y-8">
      <form action={updateNoticeDetails} className="space-y-4">
        <input type="hidden" name="notice_id" value={notice.id} />
        <input type="hidden" name="next" value={buildNoticeUrl(notice.id, "details", "saved")} />

        <div className="grid gap-2">
          <label className="text-sm font-medium">Notice Title</label>
          <input
            name="title"
            defaultValue={notice.title ?? ""}
            className="w-full rounded-md border px-3 py-2"
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Department</label>
          <select
            name="department_select"
            defaultValue={notice.department ?? ""}
            className="w-full rounded-md border px-3 py-2"
          >
            <option value="">— Select department —</option>
            {allDepartments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Responsible Person</label>
          <select
            name="responsible_person"
            defaultValue={notice.responsible_person ?? ""}
            className="w-full rounded-md border px-3 py-2"
          >
            <option value="">— Select responsible person —</option>
            {responsiblePersons.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} ({person.email}) - {person.role}
              </option>
            ))}
          </select>
          <div className="text-xs text-gray-500">
            Select a senior person or admin who is responsible for this notice.
          </div>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Valid for (days)</label>
          <input
            type="number"
            name="valid_for_days"
            min={0}
            defaultValue={notice.valid_for_days == null ? "" : String(notice.valid_for_days)}
            className="w-full rounded-md border px-3 py-2"
            placeholder="e.g. 365 for 1 year, leave empty for no expiry"
          />
          <div className="text-xs text-gray-500">
            Number of days this notice is valid for. Leave empty for no expiry.
          </div>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Tags</label>
          <input
            name="tags_csv"
            defaultValue={tagsCsv}
            placeholder="e.g. safety, update, important"
            className="w-full rounded-md border px-3 py-2"
          />
          <div className="text-xs text-gray-500">Comma-separated, used for filtering.</div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="require_acknowledgement"
              defaultChecked={notice.require_acknowledgement}
              className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="font-medium text-gray-900">Require Acknowledgement</span>
              <p className="text-sm text-gray-600 mt-0.5">
                When enabled, users assigned to this notice will need to acknowledge they have read it.
              </p>
            </div>
          </label>
        </div>

        <div className="pt-2">
          <button className="rounded-md bg-black px-4 py-2 text-white">Save Settings</button>
        </div>
      </form>

      <hr />

      <NoticeRichDescriptionEditor
        noticeId={notice.id}
        initialContent={notice.description ?? ""}
        updateAction={updateNoticeDescription}
      />

      <hr />

      <div className="space-y-2">
        <h3 className="font-medium">Status</h3>
        <form action={updateNoticeStatusAction} className="flex items-center gap-3">
          <input type="hidden" name="notice_id" value={notice.id} />
          <input type="hidden" name="next" value={buildNoticeUrl(notice.id, "details", "status_updated")} />
          <select name="status" defaultValue={notice.status} className="rounded-md border px-3 py-2">
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <button className="rounded-md border px-4 py-2 hover:bg-gray-50">Update Status</button>
        </form>
      </div>
    </div>
  );
}
