
// app/app/train-assess/page.tsx
import { enforceAnyRoleOrHome } from "@/lib/roles/enforce";

export const dynamic = "force-dynamic";

export default async function TrainAssessPage() {
  // Enforce role-based access - only allow specific roles
  await enforceAnyRoleOrHome([
    "Trainers and Assessors", 
    "Senior Management", 
    "Admin"
  ]);
  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Train/Assess</h1>
        <p className="text-sm text-muted-foreground">
          Manage training delivery and assessments for learners.
        </p>
      </div>

      {/* Section 1: Pending Onsite Training */}
      <div className="rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Pending Onsite Training</h2>
          <span className="text-sm text-muted-foreground">0 pending</span>
        </div>
        <div className="bg-gray-50 rounded-md p-4 text-center text-sm text-gray-600">
          No pending onsite training sessions at this time.
        </div>
        {/* Placeholder for training items - will be populated with data */}
      </div>

      {/* Section 2: Pending Assessments */}
      <div className="rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Pending Assessments</h2>
          <span className="text-sm text-muted-foreground">0 pending</span>
        </div>
        <div className="bg-gray-50 rounded-md p-4 text-center text-sm text-gray-600">
          No pending assessments at this time.
        </div>
        {/* Placeholder for assessment items - will be populated with data */}
      </div>

      {/* Section 3: Document Upload */}
      <div className="rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Document Upload</h2>
        </div>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Upload training materials, assessment forms, and other documents.
          </p>
          <div className="bg-gray-50 rounded-md p-4 text-center text-sm text-gray-600">
            Document upload functionality will be implemented here.
          </div>
        </div>
      </div>
    </div>
  );
}
