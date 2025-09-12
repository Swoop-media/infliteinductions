import { createSupabaseServer } from "@/lib/supabase/server";
import ContractorTabs from "./_components/ContractorTabs";

export default async function ContractorsPage() {
  const supabase = await createSupabaseServer();

  // Fetch courses marked as available for external contractors
  const { data: courses, error } = await supabase
    .from("courses")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching contractor courses:", error);
  }

  // Filter courses for external contractors (since the field might not exist yet)
  const contractorCourses = courses?.filter((course: any) => course.external_contractors === true) || [];

  // Fetch sites for the dropdown
  const { data: sites, error: sitesError } = await supabase
    .from("sites")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });

  if (sitesError) {
    console.error("Error fetching sites:", sitesError);
  }

  // Fetch completed contractor courses
  const { data: completions, error: completionsError } = await supabase
    .from("contractor_course_completions")
    .select(`
      *,
      courses:course_id (title),
      sites:site_id (name)
    `)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  if (completionsError) {
    console.error("Error fetching completions:", completionsError);
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-semibold">Contractor Training</h1>
        <p className="text-gray-600 mt-2">
          Training courses for external contractors and subcontractors.
        </p>
      </div>

      <ContractorTabs 
        courses={contractorCourses} 
        sites={sites || []} 
        completions={completions || []}
      />
    </div>
  );
}