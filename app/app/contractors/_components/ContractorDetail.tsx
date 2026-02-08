"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseBrowser } from "@/lib/supabase/client";

interface ContractorDetailProps {
  contractorId: string;
  onBack: () => void;
}

export default function ContractorDetail({ contractorId, onBack }: ContractorDetailProps) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    loadDetail();
  }, [contractorId]);

  const loadDetail = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contractor-signin/detail?id=${contractorId}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load contractor details");
      }
      const json = await res.json();
      setData(json);

      const allFiles: string[] = [];
      (json.prequalSubmissions || []).forEach((p: any) => {
        if (p.files && Array.isArray(p.files)) {
          allFiles.push(...p.files);
        }
      });

      if (allFiles.length > 0) {
        const urls: Record<string, string> = {};
        for (const filePath of allFiles) {
          try {
            const { data: signedData } = await supabaseBrowser.storage
              .from("contractor documents")
              .createSignedUrl(filePath, 3600);
            if (signedData?.signedUrl) {
              urls[filePath] = signedData.signedUrl;
            }
          } catch (e) {
            console.error("Error getting signed URL for", filePath, e);
          }
        }
        setFileUrls(urls);
      }
    } catch (err: any) {
      console.error("Error loading contractor detail:", err);
      setError(err.message || "Failed to load details");
    } finally {
      setIsLoading(false);
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("en-NZ", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const getFileName = (path: string) => {
    const parts = path.split("/");
    return parts[parts.length - 1] || path;
  };

  const getFileIcon = (path: string) => {
    const ext = path.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "PDF";
    if (["jpg", "jpeg", "png", "gif"].includes(ext || "")) return "IMG";
    if (["doc", "docx"].includes(ext || "")) return "DOC";
    return "FILE";
  };

  if (isLoading) {
    return (
      <div className="text-center py-12 text-gray-500">
        Loading contractor details...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-md">
          {error || "Failed to load contractor details"}
        </div>
        <Button variant="outline" onClick={onBack}>Back</Button>
      </div>
    );
  }

  const { signin, prequalSubmissions, signInHistory } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="text-gray-600">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to list
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl">{signin.contractor_name}</CardTitle>
              {signin.contractor_company && (
                <p className="text-gray-500 mt-1">{signin.contractor_company}</p>
              )}
            </div>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              !signin.signed_out_at
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-600"
            }`}>
              {!signin.signed_out_at ? "Currently On Site" : "Signed Out"}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Site</span>
              <p className="font-medium">{signin.site_name || "-"}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Working Airside</span>
              <p className="font-medium">{signin.working_airside ? "Yes" : "No"}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Course Completed</span>
              <p className="font-medium">
                {signin.course_completed ? (
                  <span className="text-green-600">Yes</span>
                ) : (
                  <span className="text-amber-600">No</span>
                )}
              </p>
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Signed In</span>
              <p className="font-medium">{formatDateTime(signin.signed_in_at)}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Signed Out</span>
              <p className="font-medium">{formatDateTime(signin.signed_out_at)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Pre-Qualification Submissions</CardTitle>
        </CardHeader>
        <CardContent>
          {prequalSubmissions.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">No pre-qualification submissions found for this contractor.</p>
          ) : (
            <div className="space-y-4">
              {prequalSubmissions.map((prequal: any) => (
                <div key={prequal.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          prequal.reviewed_at
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-800"
                        }`}>
                          {prequal.reviewed_at ? "Reviewed" : "Pending Review"}
                        </span>
                        {prequal.site_name && (
                          <span className="text-sm text-gray-500">{prequal.site_name}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Submitted: {formatDateTime(prequal.created_at)}
                        {prequal.reviewed_at && ` | Reviewed: ${formatDateTime(prequal.reviewed_at)}`}
                      </p>
                    </div>
                    <a
                      href={`/app/contractor-prequal/${prequal.id}`}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      {prequal.reviewed_at ? "View" : "Review"}
                    </a>
                  </div>

                  {prequal.notes && (
                    <div className="bg-gray-50 rounded p-3 mb-3">
                      <p className="text-xs text-gray-500 mb-1">Notes</p>
                      <p className="text-sm">{prequal.notes}</p>
                    </div>
                  )}

                  {prequal.files && Array.isArray(prequal.files) && prequal.files.length > 0 ? (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Documents ({prequal.files.length})</p>
                      <div className="space-y-1">
                        {prequal.files.map((filePath: string, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded border text-sm"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                getFileIcon(filePath) === "PDF" ? "bg-red-100 text-red-700" :
                                getFileIcon(filePath) === "IMG" ? "bg-blue-100 text-blue-700" :
                                "bg-gray-100 text-gray-700"
                              }`}>
                                {getFileIcon(filePath)}
                              </span>
                              <span className="truncate">{getFileName(filePath)}</span>
                            </div>
                            {fileUrls[filePath] ? (
                              <a
                                href={fileUrls[filePath]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 font-medium ml-2 whitespace-nowrap"
                              >
                                View
                              </a>
                            ) : (
                              <span className="text-gray-400 ml-2 text-xs">Loading...</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">No documents uploaded yet</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {signInHistory.length > 1 && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Sign-in History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-left p-2 font-medium">Signed In</th>
                    <th className="text-left p-2 font-medium">Signed Out</th>
                    <th className="text-left p-2 font-medium">Airside</th>
                    <th className="text-left p-2 font-medium">Course</th>
                  </tr>
                </thead>
                <tbody>
                  {signInHistory.map((entry: any) => (
                    <tr key={entry.id} className={`border-b ${entry.id === contractorId ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                      <td className="p-2">
                        {!entry.signed_out_at ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            On Site
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Left
                          </span>
                        )}
                      </td>
                      <td className="p-2">{formatDateTime(entry.signed_in_at)}</td>
                      <td className="p-2">{formatDateTime(entry.signed_out_at)}</td>
                      <td className="p-2">{entry.working_airside ? "Yes" : "No"}</td>
                      <td className="p-2">
                        {entry.course_completed ? (
                          <span className="text-green-600">Completed</span>
                        ) : (
                          <span className="text-amber-600">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
