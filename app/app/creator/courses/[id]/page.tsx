                                // app/app/creator/courses/[id]/page.tsx
                                import Link from "next/link";
                                import { redirect } from "next/navigation";
                                import { revalidatePath } from "next/cache";
                                import { createSupabaseServer } from "@/lib/supabase/server";

                                /** Helpers */
                                type ModuleType =
                                  | "digital_training"
                                  | "digital_assessment_quiz"
                                  | "onsite_training"
                                  | "onsite_assessment";

                                type TabKey = "details" | ModuleType;

                                function tabLabel(t: TabKey) {
                                  switch (t) {
                                    case "details":
                                      return "Details";
                                    case "digital_training":
                                      return "Digital Training";
                                    case "digital_assessment_quiz":
                                      return "Digital Assessment (Quiz)";
                                    case "onsite_training":
                                      return "Onsite Training";
                                    case "onsite_assessment":
                                      return "Onsite Assessment";
                                  }
                                }

                                function tabKeyFromSearch(spObj: Record<string, string | string[] | undefined>): TabKey {
                                  const raw =
                                    typeof spObj.tab === "string"
                                      ? spObj.tab
                                      : Array.isArray(spObj.tab)
                                      ? spObj.tab[0]
                                      : undefined;
                                  switch (raw) {
                                    case "details":
                                      return "details";
                                    case "digital_training":
                                      return "digital_training";
                                    case "digital_assessment_quiz":
                                    case "quiz":
                                      return "digital_assessment_quiz";
                                    case "onsite_training":
                                      return "onsite_training";
                                    case "onsite_assessment":
                                      return "onsite_assessment";
                                    default:
                                      return "details";
                                  }
                                }

                                /** Server loaders */
                                async function loadCourse(courseId: string) {
                                  "use server";
                                  const supabase = createSupabaseServer();

                                  const {
                                    data: { user },
                                  } = await supabase.auth.getUser();
                                  if (!user) redirect("/auth/login");

                                  const { data: course, error } = await supabase
                                    .from("courses")
                                    .select("*")
                                    .eq("id", courseId)
                                    .single();

                                  if (error || !course) {
                                    return { user, course: null, err: error?.message ?? "Course not found" };
                                  }
                                  return { user, course, err: null };
                                }

                                async function loadModules(courseId: string, type?: ModuleType) {
                                  "use server";
                                  const supabase = createSupabaseServer();
                                  let q = supabase.from("course_modules").select("*").eq("course_id", courseId);
                                  if (type) q = q.eq("type", type);
                                  const { data, error } = await q
                                    .order("order_index", { ascending: true })
                                    .order("created_at", { ascending: true });
                                  if (error) throw new Error(error.message);
                                  return data ?? [];
                                }

                                /** Actions */
                                async function createModuleAction(formData: FormData) {
                                  "use server";
                                  const supabase = createSupabaseServer();
                                  const courseId = String(formData.get("course_id") || "");
                                  const type = String(formData.get("type") || "") as ModuleType;

                                  const defaultTitle =
                                    type === "digital_training"
                                      ? "Training Module"
                                      : type === "digital_assessment_quiz"
                                      ? "Digital Quiz"
                                      : type === "onsite_training"
                                      ? "Onsite Training"
                                      : "Onsite Assessment";

                                  const title = (String(formData.get("title") || "").trim() || defaultTitle).slice(
                                    0,
                                    200
                                  );
                                  if (!courseId || !type) throw new Error("Missing fields");

                                  // Rely on DB defaults (stage defaults to 'draft'::course_stage)
                                  const payload: any = {
                                    course_id: courseId,
                                    type,
                                    title,
                                    order_index: 100,
                                  };

                                  const { error } = await supabase.from("course_modules").insert(payload);
                                  if (error) throw new Error(error.message);
                                  revalidatePath(`/app/creator/courses/${courseId}`);
                                }

                                async function updateCourseDetails(formData: FormData) {
                                  "use server";
                                  const supabase = createSupabaseServer();

                                  const courseId = String(formData.get("course_id") || "");
                                  if (!courseId) throw new Error("Missing course_id");

                                  const title = String(formData.get("title") || "").trim();
                                  const description = String(formData.get("description") || "").trim();

                                  const validUntilStr = String(formData.get("valid_until") || "");
                                  const retakeDaysStr = String(formData.get("retake_reminder_days") || "");
                                  const notifyLeadDaysStr = String(formData.get("notification_lead_days") || "");

                                  const updatePayload: Record<string, any> = {};
                                  if (title.length > 0) updatePayload.title = title;
                                  updatePayload.description = description;
                                  if (validUntilStr) updatePayload.valid_until = validUntilStr;
                                  if (retakeDaysStr) updatePayload.retake_reminder_days = Number(retakeDaysStr);
                                  if (notifyLeadDaysStr) updatePayload.notification_lead_days = Number(notifyLeadDaysStr);

                                  const { error } = await supabase
                                    .from("courses")
                                    .update(updatePayload)
                                    .eq("id", courseId);
                                  if (error) {
                                    throw new Error(
                                      `Save failed: ${error.message}. If this mentions unknown columns (valid_until/retake_reminder_days/notification_lead_days), add them to the courses table.`
                                    );
                                  }

                                  revalidatePath(`/app/creator/courses/${courseId}`);
                                }

                                export default async function CourseEditorPage({
                                  params,
                                  searchParams = {},
                                }: {
                                  params: { id: string };
                                  searchParams?: Record<string, string | string[] | undefined>;
                                }) {
                                  const courseId = params.id;
                                  const activeTab = tabKeyFromSearch(searchParams);

                                  const { course, err } = await loadCourse(courseId);
                                  if (err || !course) {
                                    return (
                                      <div className="p-6">
                                        <h1 className="text-xl font-semibold mb-2">Course Editor</h1>
                                        <p className="text-red-600">Error: {err ?? "Course not found"}</p>
                                        <Link href="/app/creator" className="text-blue-600 underline">
                                          Back
                                        </Link>
                                      </div>
                                    );
                                  }

                                  const [digitalTraining, quizModules, onsiteTraining, onsiteAssessment] =
                                    await Promise.all([
                                      loadModules(courseId, "digital_training"),
                                      loadModules(courseId, "digital_assessment_quiz"),
                                      loadModules(courseId, "onsite_training"),
                                      loadModules(courseId, "onsite_assessment"),
                                    ]);

                                  const tabs: { key: TabKey; href: string }[] = [
                                    { key: "details", href: `/app/creator/courses/${courseId}?tab=details` },
                                    {
                                      key: "digital_training",
                                      href: `/app/creator/courses/${courseId}?tab=digital_training`,
                                    },
                                    {
                                      key: "digital_assessment_quiz",
                                      href: `/app/creator/courses/${courseId}?tab=digital_assessment_quiz`,
                                    },
                                    {
                                      key: "onsite_training",
                                      href: `/app/creator/courses/${courseId}?tab=onsite_training`,
                                    },
                                    {
                                      key: "onsite_assessment",
                                      href: `/app/creator/courses/${courseId}?tab=onsite_assessment`,
                                    },
                                  ];

                                  return (
                                    <div className="p-6 space-y-6">
                                      {/* Header */}
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <h1 className="text-2xl font-bold">
                                            {course.title ?? "Untitled Course"}
                                          </h1>
                                          <p className="text-sm text-gray-500">Status: {course.status}</p>
                                        </div>
                                        <Link href="/app/creator" className="rounded-md border px-3 py-1 text-sm">
                                          Back
                                        </Link>
                                      </div>

                                      {/* Tabs */}
                                      <div className="flex gap-2">
                                        {tabs.map((t) => {
                                          const isActive = t.key === activeTab;
                                          return (
                                            <Link
                                              key={t.key}
                                              href={t.href}
                                              className={[
                                                "rounded-md px-3 py-1 text-sm",
                                                isActive
                                                  ? "bg-black text-white"
                                                  : "border text-gray-800 hover:bg-gray-50",
                                              ].join(" ")}
                                            >
                                              {tabLabel(t.key)}
                                            </Link>
                                          );
                                        })}
                                      </div>

                                      {/* Active tab content */}
                                      <div className="rounded-xl border p-4">
                                        {activeTab === "details" && <DetailsTab course={course} />}

                                        {activeTab === "digital_training" && (
                                          <SectionModules
                                            courseId={courseId}
                                            title="Digital Training Modules"
                                            hint="Add learning content blocks (text, files, videos, links)."
                                            type="digital_training"
                                            modules={digitalTraining}
                                          />
                                        )}

                                        {activeTab === "digital_assessment_quiz" && (
                                          <div className="space-y-4">
                                            <SectionModules
                                              courseId={courseId}
                                              title="Digital Assessment (Quiz)"
                                              hint="Add quiz modules and manage questions."
                                              type="digital_assessment_quiz"
                                              modules={quizModules}
                                            />
                                          </div>
                                        )}

                                        {activeTab === "onsite_training" && (
                                          <SectionModules
                                            courseId={courseId}
                                            title="Onsite Training Modules"
                                            hint="Add training events, trainer notes, etc."
                                            type="onsite_training"
                                            modules={onsiteTraining}
                                          />
                                        )}

                                        {activeTab === "onsite_assessment" && (
                                          <SectionModules
                                            courseId={courseId}
                                            title="Onsite Assessment Modules"
                                            hint="Add assessment activities and criteria."
                                            type="onsite_assessment"
                                            modules={onsiteAssessment}
                                          />
                                        )}
                                      </div>
                                    </div>
                                  );
                                }

                                /** DETAILS TAB */
                                function DetailsTab({ course }: { course: any }) {
                                  const title = (course?.title as string) ?? "";
                                  const description = (course?.description as string) ?? "";

                                  const hasValidUntil = Object.prototype.hasOwnProperty.call(course ?? {}, "valid_until");
                                  const hasRetakeDays = Object.prototype.hasOwnProperty.call(course ?? {}, "retake_reminder_days");
                                  const hasNotifyLead = Object.prototype.hasOwnProperty.call(course ?? {}, "notification_lead_days");

                                  let validUntil = "";
                                  if (hasValidUntil && course.valid_until) {
                                    const d = new Date(course.valid_until);
                                    if (!isNaN(d.getTime())) validUntil = d.toISOString().slice(0, 10);
                                  }

                                  return (
                                    <form action={updateCourseDetails} className="space-y-4">
                                      <input type="hidden" name="course_id" value={course.id} />
                                      <div className="grid gap-2">
                                        <label className="text-sm">Course title</label>
                                        <input
                                          name="title"
                                          defaultValue={title}
                                          className="w-full rounded-md border px-3 py-2"
                                          placeholder="Enter course title"
                                          required
                                        />
                                      </div>

                                      <div className="grid gap-2">
                                        <label className="text-sm">Description</label>
                                        <textarea
                                          name="description"
                                          defaultValue={description}
                                          className="w-full rounded-md border px-3 py-2 min-h-[120px]"
                                          placeholder="What will learners get from this course?"
                                        />
                                      </div>

                                      {hasValidUntil && (
                                        <div className="grid gap-2">
                                          <label className="text-sm">Valid until</label>
                                          <input type="date" name="valid_until" defaultValue={validUntil} className="w-full rounded-md border px-3 py-2" />
                                        </div>
                                      )}

                                      <div className="grid gap-4 sm:grid-cols-2">
                                        {hasRetakeDays && (
                                          <div className="grid gap-2">
                                            <label className="text-sm">Retake reminder (days)</label>
                                            <input
                                              type="number"
                                              name="retake_reminder_days"
                                              min={0}
                                              defaultValue={course.retake_reminder_days ?? ""}
                                              className="w-full rounded-md border px-3 py-2"
                                              placeholder="e.g., 365"
                                            />
                                          </div>
                                        )}
                                        {hasNotifyLead && (
                                          <div className="grid gap-2">
                                            <label className="text-sm">Notification lead (days)</label>
                                            <input
                                              type="number"
                                              name="notification_lead_days"
                                              min={0}
                                              defaultValue={course.notification_lead_days ?? ""}
                                              className="w-full rounded-md border px-3 py-2"
                                              placeholder="e.g., 30"
                                            />
                                          </div>
                                        )}
                                      </div>

                                      <div className="pt-2">
                                        <button className="rounded-md bg-black px-4 py-2 text-white">Save</button>
                                      </div>
                                    </form>
                                  );
                                }

                                /** Section to list + create modules */
                                async function SectionModules(props: {
                                  courseId: string;
                                  title: string;
                                  hint?: string;
                                  type: ModuleType;
                                  modules: any[];
                                  extraAction?: React.ReactNode;
                                }) {
                                  const { courseId, title, hint, type, modules, extraAction } = props;

                                  return (
                                    <div className="space-y-4">
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <h2 className="text-lg font-semibold">{title}</h2>
                                          {hint ? <p className="text-sm text-gray-500">{hint}</p> : null}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {extraAction}
                                          <form action={createModuleAction}>
                                            <input type="hidden" name="course_id" value={courseId} />
                                            <input type="hidden" name="type" value={type} />
                                            <button className="rounded-md border px-3 py-2 text-sm">+ Create Module</button>
                                          </form>
                                        </div>
                                      </div>

                                      {modules.length === 0 ? (
                                        <p className="text-sm text-gray-500">No modules yet.</p>
                                      ) : (
                                        <ul className="divide-y rounded-md border">
                                          {modules.map((m: any) => (
                                            <li key={m.id} className="flex items-center justify-between p-3">
                                              <div>
                                                <div className="font-medium">{m.title}</div>
                                                <div className="text-xs text-gray-500">
                                                  Order: {m.order_index} • Created {m.created_at ? new Date(m.created_at).toLocaleString() : "—"}
                                                </div>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <span className="rounded bg-gray-100 px-2 py-1 text-xs">{m.type}</span>
                                                {type === "digital_training" ? (
                                                  <Link
                                                    href={`/app/creator/modules/${m.id}`}
                                                    className="rounded-md bg-black px-3 py-1 text-xs text-white"
                                                  >
                                                    Edit
                                                  </Link>
                                                ) : null}
                                              </div>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  );
                                }
