
// app/app/train-assess/page.tsx
export const dynamic = "force-dynamic";

export default function TrainAssessPage() {
  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Train/Assess</h1>
        <p className="text-sm text-muted-foreground">
          Manage training delivery and assessments for learners.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border p-6">
          <h2 className="text-lg font-medium mb-2">Training Management</h2>
          <p className="text-sm text-gray-600 mb-4">
            Manage and deliver training sessions to learners.
          </p>
          <div className="space-y-2">
            <div className="text-sm">• Schedule training sessions</div>
            <div className="text-sm">• Track attendance</div>
            <div className="text-sm">• Manage training materials</div>
          </div>
        </div>

        <div className="rounded-lg border p-6">
          <h2 className="text-lg font-medium mb-2">Assessment Management</h2>
          <p className="text-sm text-gray-600 mb-4">
            Conduct and manage assessments for learners.
          </p>
          <div className="space-y-2">
            <div className="text-sm">• Conduct practical assessments</div>
            <div className="text-sm">• Record assessment results</div>
            <div className="text-sm">• Issue certifications</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-6">
        <h2 className="text-lg font-medium mb-4">Quick Actions</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <button className="rounded-md border px-4 py-2 text-left hover:bg-gray-50">
            <div className="font-medium">View Pending Assessments</div>
            <div className="text-sm text-gray-600">See learners ready for assessment</div>
          </button>
          <button className="rounded-md border px-4 py-2 text-left hover:bg-gray-50">
            <div className="font-medium">Schedule Training</div>
            <div className="text-sm text-gray-600">Plan upcoming training sessions</div>
          </button>
          <button className="rounded-md border px-4 py-2 text-left hover:bg-gray-50">
            <div className="font-medium">Assessment Records</div>
            <div className="text-sm text-gray-600">View completed assessments</div>
          </button>
        </div>
      </div>
    </div>
  );
}
