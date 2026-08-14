"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, ExternalLink, Calendar, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openSignedDocument } from "@/lib/openSignedDocument";

interface Document {
  id: string;
  title: string;
  file_path: string;
  file_type: string;
  file_size: number;
  expires_on?: string | null;
  created_at: string;
  module_title?: string;
}

interface CourseDocumentsProps {
  courseId: string;
  traineeId: string;
}

export default function CourseDocuments({ courseId, traineeId }: CourseDocumentsProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [viewIssue, setViewIssue] = useState<{
    docId: string;
    message: string;
    url?: string;
  } | null>(null);

  useEffect(() => {
    fetchDocuments();
  }, [courseId, traineeId]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/courses/${courseId}/trainee-documents?trainee_id=${traineeId}`
      );
      
      if (!response.ok) {
        throw new Error("Failed to fetch documents");
      }
      
      const data = await response.json();
      setDocuments(data);
    } catch (err) {
      console.error("Error fetching documents:", err);
      setError("Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  const handleViewDocument = async (doc: Document) => {
    setLoadingDocId(doc.id);
    setViewIssue(null);

    const result = await openSignedDocument(async () => {
      // Create signed URL for document viewing
      const response = await fetch("/api/trainee-document-view", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filePath: doc.file_path,
          courseId: courseId,
          traineeId: traineeId,
        }),
      });

      if (!response.ok) {
        let message = "Failed to get document URL. Please try again.";
        try {
          const body = await response.json();
          if (body?.error) message = `Could not open document: ${body.error}`;
        } catch {
          // keep default message
        }
        throw new Error(message);
      }

      const { signedUrl } = await response.json();
      return signedUrl;
    });

    if (!result.ok) {
      console.error("Error viewing document:", result.message);
      setViewIssue({ docId: doc.id, message: result.message, url: result.url });
    }
    setLoadingDocId(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "";
      
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[date.getUTCMonth()];
      const day = date.getUTCDate();
      const year = date.getUTCFullYear();
      
      return `${month} ${day}, ${year}`;
    } catch (error) {
      console.error('Date formatting error:', error);
      return "";
    }
  };

  const isExpired = (expiryDate: string | null | undefined) => {
    if (!expiryDate) return false;
    return new Date(expiryDate) < new Date();
  };

  const getFileTypeIcon = (fileType: string) => {
    if (fileType.includes('pdf')) return '📄';
    if (fileType.includes('image')) return '🖼️';
    if (fileType.includes('word') || fileType.includes('document')) return '📝';
    if (fileType.includes('excel') || fileType.includes('spreadsheet')) return '📊';
    return '📎';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Course Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading documents...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Course Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-red-600">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Course Documents
        </CardTitle>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No documents uploaded by the trainee for this course.
          </p>
        ) : (
          <div className="space-y-4">
            {documents.map((doc) => {
              const expired = isExpired(doc.expires_on);
              
              return (
                <div
                  key={doc.id}
                  className={`border rounded-lg p-4 ${
                    expired ? 'bg-red-50 border-red-200' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{getFileTypeIcon(doc.file_type)}</span>
                        <div>
                          <h4 className="font-medium">
                            {doc.title}
                          </h4>
                          {doc.module_title && (
                            <p className="text-sm text-muted-foreground">
                              Module: {doc.module_title}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{formatFileSize(doc.file_size)}</span>
                        <span>Uploaded: {formatDate(doc.created_at)}</span>
                        {doc.expires_on && (
                          <span className={expired ? 'text-red-600 font-medium' : ''}>
                            <Calendar className="inline h-3 w-3 mr-1" />
                            {expired ? 'Expired' : 'Expires'}: {formatDate(doc.expires_on)}
                          </span>
                        )}
                      </div>
                      
                      {expired && (
                        <div className="mt-2 text-sm text-red-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          This document has expired and may need to be renewed
                        </div>
                      )}
                    </div>
                    
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewDocument(doc)}
                      disabled={loadingDocId === doc.id}
                    >
                      {loadingDocId === doc.id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <ExternalLink className="h-4 w-4 mr-1" />
                          View
                        </>
                      )}
                    </Button>
                  </div>

                  {viewIssue?.docId === doc.id && (
                    <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <p>{viewIssue.message}</p>
                        {viewIssue.url && (
                          <a
                            href={viewIssue.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 font-medium text-blue-700 underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Open {doc.title}
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}