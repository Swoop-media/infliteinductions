"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

interface RejectModuleButtonProps {
  assignmentId: string;
  courseId: string;
  moduleId: string;
  moduleTitle: string;
  moduleType: string;
  userId: string;
}

export default function RejectModuleButton({
  assignmentId,
  courseId,
  moduleId,
  moduleTitle,
  moduleType,
  userId,
}: RejectModuleButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setError("Please provide a reason for rejection");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/reject-module", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignmentId,
          courseId,
          moduleId,
          moduleTitle,
          moduleType,
          userId,
          rejectionReason: rejectionReason.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to reject module");
      }

      // Close modal and refresh the page
      setShowModal(false);
      setRejectionReason("");
      router.refresh();
    } catch (error) {
      console.error("Failed to reject module:", error);
      setError(error instanceof Error ? error.message : "Failed to reject module");
    } finally {
      setLoading(false);
    }
  };

  const getModuleTypeDisplay = (type: string) => {
    switch (type) {
      case "digital_training":
        return "Digital Training";
      case "digital_assessment_quiz":
        return "Digital Quiz";
      case "onsite_training":
        return "Onsite Training";
      case "onsite_assessment":
        return "Onsite Assessment";
      default:
        return type;
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors"
        title="Reject this module and require re-completion"
      >
        Reject
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Reject Module
              </h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setRejectionReason("");
                  setError(null);
                }}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Are you sure you want to reject this module?</strong>
                </p>
                <p className="text-xs text-yellow-700 mt-2">
                  Module: <strong>{moduleTitle}</strong>
                  <br />
                  Type: <strong>{getModuleTypeDisplay(moduleType)}</strong>
                </p>
                <p className="text-xs text-yellow-700 mt-2">
                  This action will:
                  <ul className="list-disc ml-4 mt-1">
                    <li>Mark the module as incomplete</li>
                    <li>Require the trainee to complete it again</li>
                    <li>Move the course back to their training page</li>
                    <li>Send a notification to the trainee</li>
                  </ul>
                </p>
              </div>

              {/* Rejection Reason */}
              <div>
                <label
                  htmlFor="rejection-reason"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Reason for Rejection <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="rejection-reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  rows={4}
                  placeholder="Please explain why this module is being rejected and what needs to be corrected..."
                  disabled={loading}
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModal(false);
                  setRejectionReason("");
                  setError(null);
                }}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={loading || !rejectionReason.trim()}
                className={`
                  px-4 py-2 text-sm font-medium rounded-md transition-colors
                  ${
                    loading || !rejectionReason.trim()
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-red-600 hover:bg-red-700 text-white"
                  }
                `}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Rejecting...
                  </span>
                ) : (
                  "Reject Module"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}