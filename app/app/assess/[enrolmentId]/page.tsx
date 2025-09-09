// @ts-nocheck
// @ts-nocheck
/* Assessor UI: render per-module forms from schema and save submissions (server-side uploads) */
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import AssessorFormRenderer from "@/components/AssessorFormRenderer";

type SchemaRow = {
  id: string;
  course_id: string;
  module: "onsite_training" | "onsite_assessment";
  schema: any[];
};

type EnrolmentRow = {
  id: string;
  course_id: string;
  user_id: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export const dynamic = "force-dynamic";

export default async function AssessPage({
  params,
  searchParams,
}: {
  params: Promise<{ enrolmentId: string }>;
  searchParams: Promise<{ module?: string }>;
}) {
  const { enrolmentId } = await params;
  const { module: moduleParam } = await searchParams;

  const supabase = await createSupabaseServer();

  // Require login
  const { data: me } = await supabase.auth.getUser();
  if (!me?.user) redirect(`/app?error=signin_required`);

  // Load enrolment
  const { data: enrol, error: eErr } = await supabase
    .from("enrolments")
    .select("*")
    .eq("id", enrolmentId)
    .maybeSingle<EnrolmentRow>();
  if (eErr || !enrol) notFound();

  // Load course
  const { data: course } = await supabase
    .from("courses")
    .select("id,title")
    .eq("id", enrol.course_id)
    .maybeSingle<{ id: string; title: string | null }>();

  // Load schemas
  const { data: schemasData } = await supabase
    .from("assessor_form_schemas")
    .select("*")
    .eq("course_id", enrol.course_id) as { data: SchemaRow[] | null };

  // Add null check for schemas variable before using .find() method
  const schemas = schemasData || [];

  const trainingSchema = schemas.find((s) => s.module === "onsite_training")?.schema || [];
  const assessmentSchema = schemas.find((s) => s.module === "onsite_assessment")?.schema || [];

  const activeModule = (moduleParam as "onsite_training" | "onsite_assessment" | undefined) || "onsite_training";

  // ---------- SERVER ACTION (service-side uploads + upsert) ----------
  async function submitAssessorForm(fd: FormData) {
    "use server";
    const supa = await createSupabaseServer();
    const admin = supabaseAdmin();

    const enrolment_id = String(fd.get("enrolment_id") || "");
    const module = String(fd.get("module") || "") as "onsite_training" | "onsite_assessment";
    const answers_json = String(fd.get("answers_json") || "{}");

    if (!enrolment_id || !module) {
      redirect(`/app/assess/${enrolmentId}?error=missing_fields`);
    }

    // Parse answers posted from client (non-file values)
    let answers: Record<string, any> = {};
    try {
      const parsed = JSON.parse(answers_json || "{}");
      if (parsed && typeof parsed === "object") answers = parsed;
    } catch {
      // ignore; keep empty
    }

    // Get schema for this module so we know which file fields to expect
    if (!enrol) {
      redirect(`/app/assess/${enrolmentId}?error=enrolment_not_found`);
    }
    
    const { data: schemaRow } = await supa
      .from("assessor_form_schemas")
      .select("*")
      .eq("course_id", enrol.course_id)
      .eq("module", module)
      .maybeSingle<SchemaRow>();
    const schema = (schemaRow?.schema as any[]) || [];

    // Ensure bucket exists (admin client can manage buckets)
    try {
      // supabase-js v2: createBucket will fail if exists; ignore error
      // @ts-ignore
      await admin.storage.createBucket("assessor_uploads", { public: false });
    } catch (e) {
      // ignore if already exists / not supported
    }

    // For each file field: read file from FormData and upload via service role
    const userRes = await supa.auth.getUser();
    const userId = userRes.data.user?.id || "unknown";

    for (const f of schema) {
      if (f.type !== "file") continue;
      const file = fd.get(f.key) as unknown as File | null;
      if (!file || (typeof (file as any).size === "number" && (file as any).size === 0)) {
        continue; // optional or not provided
      }

      const filename = safeName((file as any).name || `${f.key}.bin`);
      const path = `${userId}/${enrolment_id}/${module}/${Date.now()}_${filename}`;

      const up = await admin.storage.from("assessor_uploads").upload(path, file as any, {
        cacheControl: "3600",
        upsert: false,
      });
      if (up.error) {
        redirect(`/app/assess/${enrolmentId}?error=${encodeURIComponent("Upload failed: " + up.error.message)}`);
      }

      // Record storage location in answers
      answers[f.key] = { storageBucket: "assessor_uploads", path };
    }

    // Upsert (unique on enrolment_id+module)
    const { error } = await supa
      .from("assessor_submissions")
      .upsert([{ enrolment_id, module, answers }], { onConflict: "enrolment_id,module" });

    if (error) {
      redirect(`/app/assess/${enrolmentId}?error=${encodeURIComponent(error.message)}`);
    }

    // Mark module as completed in module_progress
    const { data: moduleData } = await supa
      .from("course_modules")
      .select("id")
      .eq("course_id", enrol.course_id)
      .eq("type", module)
      .maybeSingle();

    if (moduleData) {
      // Insert progress record (idempotent)
      try {
        await supa
          .from("module_progress")
          .insert({ 
            enrolment_id: enrolment_id, 
            module_id: moduleData.id 
          });
      } catch {
        // Ignore if already exists
      }

      // Try to complete the enrolment if all modules are done
      try {
        await supa.rpc("try_complete_enrolment", { p_enrolment_id: enrolment_id });
      } catch {
        // Ignore errors
      }
    }

    revalidatePath(`/app/assess/${enrolmentId}`);
    revalidatePath(`/app/train-assess`);
    redirect(`/app/assess/${enrolmentId}?ok=submitted&module=${module}`);
  }

  // ---------- UI ----------
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Assessment — {course?.title || "Course"}</h2>
          <p className="text-xs text-muted-foreground">Enrolment: {enrolmentId}</p>
        </div>
        <Link href="/app" className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">
          Back
        </Link>
      </div>

      <div className="flex gap-2">
        <Tab href={`/app/assess/${enrolmentId}?module=onsite_training`} active={activeModule === "onsite_training"}>
          Onsite training
        </Tab>
        <Tab href={`/app/assess/${enrolmentId}?module=onsite_assessment`} active={activeModule === "onsite_assessment"}>
          Onsite assessment
        </Tab>
      </div>

      {activeModule === "onsite_training" ? (
        <Section title="Onsite training form">
          <AssessorFormRenderer
            schema={trainingSchema as any[]}
            enrolmentId={enrolmentId}
            module="onsite_training"
            onSubmitToServer={submitAssessorForm}
          />
        </Section>
      ) : (
        <Section title="Onsite assessment form">
          <AssessorFormRenderer
            schema={assessmentSchema as any[]}
            enrolmentId={enrolmentId}
            module="onsite_assessment"
            onSubmitToServer={submitAssessorForm}
          />
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-4">
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-2 text-sm font-medium ${
        active ? "bg-black text-white" : "border border-gray-200 hover:bg-gray-100"
      }`}
    >
      {children}
    </Link>
  );
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 160);
}
