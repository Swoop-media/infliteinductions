
"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Bug, X, Upload, Send } from "lucide-react";

interface ReportIssueProps {
  userId: string;
}

export default function ReportIssueButton({ userId }: ReportIssueProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setAttachments(prev => [...prev, ...newFiles]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const getBrowserInfo = () => {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setIsSubmitting(true);

    try {
      // Get browser and context info
      const browserInfo = getBrowserInfo();
      
      // Convert images to base64 for Teams message
      const attachmentData = await Promise.all(
        attachments.map(async (file) => {
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          return {
            name: file.name,
            type: file.type,
            size: file.size,
            data: base64
          };
        })
      );

      // Format the report for Teams
      const reportMessage = [
        "🐛 **Issue Report**",
        "",
        "**URL/Page:** " + (url || browserInfo.url),
        "",
        "**Issue Description:**",
        description,
        "",
        "**Context Information:**",
        `• User ID: ${userId}`,
        `• Page: ${browserInfo.url}`,
        `• Browser: ${browserInfo.userAgent}`,
        `• Platform: ${browserInfo.platform}`,
        `• Viewport: ${browserInfo.viewport}`,
        `• Language: ${browserInfo.language}`,
        `• Timestamp: ${browserInfo.timestamp}`,
        "",
        attachmentData.length > 0 ? `**Attachments:** ${attachmentData.length} file(s)` : "",
        attachmentData.map(att => `• ${att.name} (${att.type}, ${Math.round(att.size/1024)}KB)`).join("\n")
      ].filter(Boolean).join("\n");

      // Send to Teams via API
      const response = await fetch('/api/report-issue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: reportMessage,
          attachments: attachmentData,
          context: browserInfo,
          userId
        }),
      });

      if (response.ok) {
        // Reset form
        setUrl("");
        setDescription("");
        setAttachments([]);
        setIsOpen(false);
        alert("Issue reported successfully! We'll get back to you soon.");
      } else {
        throw new Error('Failed to submit report');
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      alert("Failed to submit report. Please try again or contact support directly.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 hover:bg-red-50 hover:text-red-600"
        title="Report an issue"
      >
        <Bug className="h-4 w-4" />
        <span className="hidden sm:inline">Report Issue</span>
      </Button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Bug className="h-5 w-5 text-red-600" />
                Report an Issue
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
                  URL/Page Address <span className="text-gray-500">(current page will be auto-filled)</span>
                </label>
                <input
                  type="url"
                  id="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={window.location.href}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Issue Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Please describe the issue you're experiencing in detail..."
                  rows={4}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Attachments <span className="text-gray-500">(screenshots, files to help show the issue)</span>
                </label>
                
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  className="hidden"
                />
                
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Choose Files
                </Button>

                {attachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {attachments.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 px-2 py-1 rounded text-sm">
                        <span className="truncate">{file.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAttachment(index)}
                          className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!description.trim() || isSubmitting}
                  className="flex-1 bg-red-600 hover:bg-red-700 flex items-center gap-2"
                >
                  {isSubmitting ? (
                    "Sending..."
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Report
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
