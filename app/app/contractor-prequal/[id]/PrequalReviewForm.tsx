"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseBrowser } from "@/lib/supabase/client";

interface PrequalReviewFormProps {
  submission: any;
  currentUserId: string;
}

export default function PrequalReviewForm({ submission, currentUserId }: PrequalReviewFormProps) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<string[]>(submission.file_paths || []);
  const [reviewed, setReviewed] = useState(submission.reviewed || false);
  const [notes, setNotes] = useState(submission.notes || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingFile = (index: number) => {
    setExistingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const uploadedPaths: string[] = [...existingFiles];
      
      for (const file of files) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${submission.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `contractor-prequal/${fileName}`;

        const { error: uploadError } = await supabaseBrowser.storage
          .from("contractor documents")
          .upload(filePath, file);

        if (uploadError) {
          throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);
        }

        uploadedPaths.push(filePath);
      }

      const updateData: any = {
        file_paths: uploadedPaths,
        notes: notes,
      };

      if (reviewed && !submission.reviewed) {
        updateData.reviewed = true;
        updateData.reviewed_at = new Date().toISOString();
        updateData.reviewed_by = currentUserId;
      } else if (!reviewed) {
        updateData.reviewed = false;
        updateData.reviewed_at = null;
        updateData.reviewed_by = null;
      }

      const { error: updateError } = await supabaseBrowser
        .from("contractor_prequal_submissions" as any)
        .update(updateData)
        .eq("id", submission.id);

      if (updateError) throw updateError;

      setSuccess(true);
      setFiles([]);
    } catch (err: any) {
      console.error("Error updating submission:", err);
      setError(err.message || "Failed to save. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-NZ", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const getFileName = (path: string) => {
    return path.split("/").pop() || path;
  };

  if (success) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="bg-green-100 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-green-700 mb-2">
            Pre-Qualification Updated Successfully
          </h2>
          <p className="text-gray-600 mb-6">
            The contractor pre-qualification has been saved.
          </p>
          <Button onClick={() => router.push("/app/contractors")}>
            Return to Contractors
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contractor Pre-Qualification Review</CardTitle>
        <CardDescription>
          Review and upload documentation for this contractor
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Contractor:</span>
              <div className="font-medium">{submission.contractor_name}</div>
            </div>
            {submission.contractor_company && (
              <div>
                <span className="text-gray-500">Company:</span>
                <div className="font-medium">{submission.contractor_company}</div>
              </div>
            )}
            {submission.sites?.name && (
              <div>
                <span className="text-gray-500">Site:</span>
                <div className="font-medium">{submission.sites.name}</div>
              </div>
            )}
            <div>
              <span className="text-gray-500">Submitted:</span>
              <div className="font-medium">{formatDate(submission.created_at)}</div>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Pre-Qualification Documents
            </label>
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="mt-1 text-xs text-gray-500">
              Accepted formats: PDF, DOC, DOCX, JPG, PNG
            </p>
          </div>

          {existingFiles.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Existing Files
              </label>
              <div className="space-y-2">
                {existingFiles.map((path, index) => (
                  <div
                    key={path}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded border"
                  >
                    <span className="text-sm truncate flex-1">{getFileName(path)}</span>
                    <div className="flex gap-2">
                      <a
                        href={`/app/files/${encodeURIComponent(path)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-sm"
                      >
                        View
                      </a>
                      <button
                        type="button"
                        onClick={() => removeExistingFile(index)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {files.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Files to Upload
              </label>
              <div className="space-y-2">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-blue-50 rounded border border-blue-200"
                  >
                    <span className="text-sm truncate flex-1">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Add any notes about this pre-qualification..."
            />
          </div>

          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <input
              type="checkbox"
              id="reviewed"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
              className="mt-1 h-5 w-5 text-green-600 rounded border-gray-300"
            />
            <label htmlFor="reviewed" className="text-sm">
              <span className="font-medium text-amber-800">I confirm I have reviewed this contractor's pre-qualification documents</span>
              <p className="text-amber-700 mt-1">
                By checking this box, you acknowledge that you have verified the contractor's qualifications and approve their access to the site.
              </p>
            </label>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
