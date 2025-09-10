"use client";
// @ts-nocheck
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type CompletedTrainee = {
  user_id: string;
  assignment_id: string;
  completed_at: string;
  full_name: string | null;
  email: string | null;
};

async function fetchCompletedTrainees(courseId: string): Promise<CompletedTrainee[]> {
  try {
    const response = await fetch(`/api/courses/${courseId}/completed-trainees`);
    if (!response.ok) {
      throw new Error('Failed to fetch completed trainees');
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching completed trainees:", error);
    return [];
  }
}

async function sendResitNotifications(courseId: string, selectedTrainees: string[]) {
  try {
    const response = await fetch(`/api/courses/${courseId}/send-resit-notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ selectedTrainees }),
    });

    if (!response.ok) {
      throw new Error('Failed to send notifications');
    }

    return await response.json();
  } catch (error) {
    console.error("Error sending resit notifications:", error);
    throw error;
  }
}

export default function ResitNotificationMenu({ 
  courseId, 
  courseStatus 
}: { 
  courseId: string; 
  courseStatus: string;
}) {
  const [completedTrainees, setCompletedTrainees] = useState<CompletedTrainee[]>([]);
  const [selectedTrainees, setSelectedTrainees] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const router = useRouter();

  // Only show for published courses
  if (courseStatus !== "published") {
    return null;
  }

  useEffect(() => {
    fetchCompletedTrainees(courseId).then(trainees => {
      setCompletedTrainees(trainees);
      setLoading(false);
    });
  }, [courseId]);

  // Don't show if no one has completed the course
  if (loading) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="text-sm text-blue-700">Loading completed trainees...</div>
      </div>
    );
  }

  if (completedTrainees.length === 0) {
    return null;
  }

  const handleTraineeToggle = (traineeId: string) => {
    const newSelected = new Set(selectedTrainees);
    if (newSelected.has(traineeId)) {
      newSelected.delete(traineeId);
    } else {
      newSelected.add(traineeId);
    }
    setSelectedTrainees(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTrainees(new Set(completedTrainees.map(t => t.user_id)));
    } else {
      setSelectedTrainees(new Set());
    }
  };

  const handleSendNotifications = async () => {
    if (selectedTrainees.size === 0) {
      alert("Please select at least one trainee to notify.");
      return;
    }

    setSending(true);
    try {
      await sendResitNotifications(courseId, Array.from(selectedTrainees));
      router.push(`/app/creator/courses/${courseId}?tab=details&notice=resit_notifications_sent&count=${selectedTrainees.size}`);
    } catch (error) {
      console.error("Failed to send notifications:", error);
      alert("Failed to send notifications. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-blue-600">📢</span>
        <h3 className="text-sm font-medium text-blue-900">
          Course Change Notifications
        </h3>
      </div>
      
      <p className="text-sm text-blue-700">
        This course has been published and {completedTrainees.length} trainee{completedTrainees.length !== 1 ? 's have' : ' has'} completed it. 
        You can notify them that the course has changed and they need to resit it.
      </p>

      <div className="space-y-3">
        <div className="space-y-2">
          <div className="text-xs font-medium text-blue-900">Select trainees to notify:</div>
          <div className="max-h-40 overflow-y-auto space-y-1 bg-white rounded border p-2">
            {completedTrainees.map((trainee) => (
              <label key={trainee.user_id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedTrainees.has(trainee.user_id)}
                  onChange={() => handleTraineeToggle(trainee.user_id)}
                  className="rounded"
                />
                <div className="flex-1">
                  <span className="font-medium">{trainee.full_name || "Unknown Name"}</span>
                  <span className="text-gray-500 ml-2">{trainee.email}</span>
                  <div className="text-xs text-gray-400">
                    Completed: {new Date(trainee.completed_at).toLocaleDateString()}
                  </div>
                </div>
              </label>
            ))}
          </div>
          
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-blue-700">
              <input
                type="checkbox"
                checked={selectedTrainees.size === completedTrainees.length && completedTrainees.length > 0}
                onChange={(e) => handleSelectAll(e.target.checked)}
              />
              Select all
            </label>
          </div>
        </div>

        <button
          onClick={handleSendNotifications}
          disabled={sending || selectedTrainees.size === 0}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? "Sending..." : `Send Resit Notifications (${selectedTrainees.size})`}
        </button>
      </div>
      
      <div className="text-xs text-blue-600">
        💡 This will send both in-app notifications and Teams messages to selected trainees.
      </div>
    </div>
  );
}