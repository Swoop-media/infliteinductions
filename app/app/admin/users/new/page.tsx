// @ts-nocheck

// @ts-nocheck
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import { redirect } from "next/navigation";
import NewUserForm from "./NewUserForm";

async function fetchData() {
  const supabase = await createSupabaseServer();

  // Fetch courses for assignment with department
  const { data: coursesData } = await supabase
    .from("courses")
    .select("id, title, status, department")
    .eq("status", "published")
    .order("title");

  // Fetch authorizations with department
  const { data: authsData } = await supabase
    .from("authorisations")
    .select("id, title, status, department")
    .eq("status", "active")
    .order("title");

  // Fetch departments
  const { data: departmentsData } = await supabase
    .from("departments")
    .select("id, name, active")
    .eq("active", true)
    .order("name");

  // Fetch job descriptions
  const { data: jobDescriptionsData } = await supabase
    .from("job_descriptions")
    .select("id, name, active")
    .eq("active", true)
    .order("name");

  return {
    courses: coursesData ?? [],
    authorizations: authsData ?? [],
    departments: departmentsData ?? [],
    jobDescriptions: jobDescriptionsData ?? []
  };
}

export default async function NewUserPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) redirect("/app/home");

  const { courses, authorizations, departments, jobDescriptions } = await fetchData();

  // Await searchParams before accessing its properties
  const params = await searchParams;
  const error = Array.isArray(params?.error) 
    ? params?.error[0] 
    : params?.error;
  
  const success = Array.isArray(params?.ok) 
    ? params?.ok[0] 
    : params?.ok;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Add New User</h1>
        <Link
          href="/app/admin?tab=users"
          className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
        >
          ← Back to Users
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          User created successfully!
        </div>
      )}

      <NewUserForm
        courses={courses}
        authorizations={authorizations}
        departments={departments}
        jobDescriptions={jobDescriptions}
      />
    </div>
  );
}
