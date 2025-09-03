
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import { redirect } from "next/navigation";
import Link from "next/link";

async function fetchData() {
  const supabase = await createSupabaseServer();

  // Fetch courses for assignment
  const { data: coursesData } = await supabase
    .from("courses")
    .select("id, title, status")
    .eq("status", "published")
    .order("title");

  // Fetch authorizations
  const { data: authsData } = await supabase
    .from("authorisations")
    .select("id, title, status")
    .in("status", ["published", "active"])
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
          href="/app/admin/users"
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

      <form action="/app/admin/users/create" method="post" className="space-y-6">
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-lg font-medium">User Information</h2>
          
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email Address *
              </label>
              <input
                type="email"
                name="email"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                placeholder="user@company.com"
              />
              <p className="mt-1 text-xs text-gray-500">
                Must match their Microsoft account email
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Full Name *
              </label>
              <input
                type="text"
                name="full_name"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Department
              </label>
              <select
                name="department"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              >
                <option value="">Select Department</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.name}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Job Description
              </label>
              <select
                name="job_description"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              >
                <option value="">Select Job Description</option>
                {jobDescriptions.map((job) => (
                  <option key={job.id} value={job.name}>
                    {job.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {courses.length > 0 && (
          <div className="rounded-lg border bg-white p-6">
            <h2 className="mb-4 text-lg font-medium">Assign Courses</h2>
            <div className="space-y-2">
              {courses.map((course) => (
                <label key={course.id} className="flex items-center">
                  <input
                    type="checkbox"
                    name="course_ids"
                    value={course.id}
                    className="mr-2 rounded border-gray-300"
                  />
                  <span className="text-sm">{course.title}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-lg font-medium">Assign Authorizations</h2>
          {authorizations.length > 0 ? (
            <div className="space-y-2">
              {authorizations.map((auth) => (
                <label key={auth.id} className="flex items-center">
                  <input
                    type="checkbox"
                    name="authorization_ids"
                    value={auth.id}
                    className="mr-2 rounded border-gray-300"
                  />
                  <span className="text-sm">{auth.title}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No authorizations available</p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            Create User
          </button>
          <Link
            href="/app/admin/users"
            className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
