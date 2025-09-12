import { createSupabaseServer } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import ContractorCoursePlayer from "./_components/ContractorCoursePlayer";

interface ContractorCoursePageProps {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ registrationId?: string }>;
}

export default async function ContractorCoursePage({
  params,
  searchParams,
}: ContractorCoursePageProps) {
  const supabase = await createSupabaseServer();
  const { courseId } = await params;
  const { registrationId } = await searchParams;

  // Verify registration exists
  if (!registrationId) {
    redirect("/app/contractors");
  }

  const { data: registration, error: regError } = await supabase
    .from("contractor_course_completions")
    .select(`
      *,
      sites:site_id (name, address)
    `)
    .eq("id", registrationId)
    .eq("course_id", courseId)
    .single();

  if (regError || !registration) {
    redirect("/app/contractors");
  }

  // Get course data
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .eq("external_contractors", true)
    .eq("status", "published")
    .single();

  if (courseError || !course) {
    notFound();
  }

  // Get course modules
  const { data: modules, error: modulesError } = await supabase
    .from("course_modules")
    .select("*")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true });

  if (modulesError) {
    console.error("Error fetching modules:", modulesError);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">
                  {(course as any).title || "Contractor Training"}
                </h1>
                <div className="mt-1 flex items-center text-sm text-gray-500">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-3">
                    Contractor Course
                  </span>
                  <span>Trainee: {(registration as any).contractor_name}</span>
                  <span className="mx-2">•</span>
                  <span>Site: {(registration as any).sites?.name}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ContractorCoursePlayer
        course={course as any}
        modules={modules || []}
        registration={registration as any}
      />
    </div>
  );
}