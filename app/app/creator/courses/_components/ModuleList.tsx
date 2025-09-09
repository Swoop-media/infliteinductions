// @ts-nocheck
import Link from "next/link";
import { moveModuleAction, deleteModuleAction } from "@/app/app/creator/modules/actions";
import { ModuleType } from "@/lib/types/module";
import { moduleEditHref } from "@/lib/utils/module";

type Row = {
  id: string;
  title: string | null;
  created_at: string;
  order: number | null;
};

export default function ModuleList({
  courseId,
  type,
  modules,
  header,
}: {
  courseId: string;
  type: ModuleType;
  modules: Row[];
  header?: string;
}) {
  return (
    <div className="rounded-xl border">
      <div className="border-b px-3 py-2">
        <div className="font-semibold text-sm">{header ?? "Modules"}</div>
        <div className="text-xs text-gray-500">
          Click the title to open/edit. Use arrows to reorder. Delete removes the module.
        </div>
      </div>
      <ul className="p-3 space-y-2">
        {modules.length === 0 ? (
          <li className="text-sm text-gray-500">No modules yet.</li>
        ) : (
          modules.map((m) => {
            const href = moduleEditHref(type, m.id);
            const ord = m.order ?? 0;
            const created = new Date(m.created_at).toISOString().replace("T", " ").replace("Z", " UTC");
            return (
              <li key={m.id} className="rounded border px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <Link href={href} className="text-sm font-medium underline">
                      {m.title || (type === "onsite_assessment" ? "Onsite Assessment" : "Onsite Training")}
                    </Link>
                    <div className="text-xs text-gray-500">Order: {ord} • Created {created}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={moveModuleAction}>
                      <input type="hidden" name="module_id" value={m.id} />
                      <input type="hidden" name="course_id" value={courseId} />
                      <input type="hidden" name="type" value={type} />
                      <input type="hidden" name="direction" value="up" />
                      <button className="rounded border px-2 py-1 text-xs hover:bg-gray-50" title="Move up">↑</button>
                    </form>
                    <form action={moveModuleAction}>
                      <input type="hidden" name="module_id" value={m.id} />
                      <input type="hidden" name="course_id" value={courseId} />
                      <input type="hidden" name="type" value={type} />
                      <input type="hidden" name="direction" value="down" />
                      <button className="rounded border px-2 py-1 text-xs hover:bg-gray-50" title="Move down">↓</button>
                    </form>
                    <form action={deleteModuleAction}>
                      <input type="hidden" name="module_id" value={m.id} />
                      <input type="hidden" name="course_id" value={courseId} />
                      <input type="hidden" name="type" value={type} />
                      <button className="rounded border px-2 py-1 text-xs hover:bg-red-50" title="Delete">Delete</button>
                    </form>
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
