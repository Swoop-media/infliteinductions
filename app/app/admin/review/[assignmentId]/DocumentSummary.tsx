"use client";

import { useState } from "react";
import { FileText, ExternalLink, Calendar, AlertCircle } from "lucide-react";

interface Document {
  id: string;
  title: string;
  course_title: string;
  module_title: string;
  storage_path: string;
  expires_on?: string | null;
  created_at: string;
  user_id: string;
}

interface Props {
  documents: Document[];
}

export default function DocumentSummary({ documents }: Props) {
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);

  const handleViewDocument = async (doc: Document) => {
    setLoadingDoc(doc.id);
    
    try {
      // Request a signed URL from the backend
      const response = await fetch("/api/admin/document-view", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filePath: doc.storage_path,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get document URL");
      }

      const { signedUrl } = await response.json();
      
      // Open in new tab
      window.open(signedUrl, "_blank");
    } catch (error) {
      console.error("Error viewing document:", error);
      alert("Failed to open document. Please try again.");
    } finally {
      setLoadingDoc(null);
    }
  };

  const isExpired = (expiryDate: string | null | undefined) => {
    if (!expiryDate) return false;
    return new Date(expiryDate) < new Date();
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (!documents || documents.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Document Summary</h2>
        <div className="text-sm text-gray-500 italic">No documents uploaded for this authorization</div>
      </div>
    );
  }

  // Group documents by course and module
  const groupedDocs = documents.reduce((acc, doc) => {
    const key = `${doc.course_title}::${doc.module_title}`;
    if (!acc[key]) {
      acc[key] = {
        courseTitle: doc.course_title,
        moduleTitle: doc.module_title,
        documents: [],
      };
    }
    acc[key].documents.push(doc);
    return acc;
  }, {} as Record<string, { courseTitle: string; moduleTitle: string; documents: Document[] }>);

  return (
    <div className="rounded-xl border bg-white p-6">
      <h2 className="text-lg font-semibold mb-4">Document Summary</h2>
      <div className="space-y-4">
        {Object.values(groupedDocs).map((group, groupIdx) => (
          <div key={groupIdx} className="border rounded-lg p-4 bg-gray-50">
            <div className="mb-3">
              <h3 className="font-medium text-gray-900">{group.courseTitle}</h3>
              <p className="text-sm text-gray-600">{group.moduleTitle}</p>
            </div>
            
            <div className="space-y-2">
              {group.documents.map((doc) => {
                const expired = isExpired(doc.expires_on);
                
                return (
                  <div
                    key={doc.id}
                    className={`flex items-center justify-between p-3 bg-white rounded border ${
                      expired ? "border-red-200 bg-red-50" : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <FileText className={`w-5 h-5 ${expired ? "text-red-400" : "text-gray-400"}`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{doc.title}</span>
                          {expired && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <AlertCircle className="w-3 h-3" />
                              Expired
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Uploaded: {formatDate(doc.created_at)}
                          </span>
                          {doc.expires_on && (
                            <span className={expired ? "text-red-600 font-medium" : ""}>
                              Expires: {formatDate(doc.expires_on)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleViewDocument(doc)}
                      disabled={loadingDoc === doc.id}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loadingDoc === doc.id ? (
                        <span>Loading...</span>
                      ) : (
                        <>
                          <ExternalLink className="w-4 h-4" />
                          View
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}