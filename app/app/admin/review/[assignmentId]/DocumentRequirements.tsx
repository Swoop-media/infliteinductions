"use client";

import { useState } from "react";
import { FileText, ExternalLink, Calendar, AlertCircle, CheckCircle, Clock, XCircle, Upload } from "lucide-react";
import { openSignedDocument } from "@/lib/openSignedDocument";

interface Document {
  id: string;
  title: string;
  course_title: string;
  module_title: string;
  storage_path: string;
  expires_on?: string | null;
  created_at: string;
  user_id: string;
  block_id?: string | null;
  module_id?: string | null;
}

interface Course {
  course_id: string;
  course_title: string;
  course_description?: string;
  modules: Array<{
    module_id: string;
    module_title: string;
    module_type: string;
  }>;
}

interface DocumentRequirement {
  id: string;
  module_id: string;
  module_title: string;
  course_id: string | null;
  course_title: string;
  label: string;
  require_expiry: boolean;
  order_index: number;
}

interface Props {
  documents: Document[];
  courses: Course[];
  documentRequirements?: DocumentRequirement[];
}

export default function DocumentRequirements({ documents, courses, documentRequirements = [] }: Props) {
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  const [viewIssue, setViewIssue] = useState<{
    docId: string;
    message: string;
    url?: string;
  } | null>(null);

  const handleViewDocument = async (doc: Document) => {
    setLoadingDoc(doc.id);
    setViewIssue(null);

    const result = await openSignedDocument(async () => {
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
        throw new Error("Failed to get document URL. Please try again.");
      }

      const { signedUrl } = await response.json();
      return signedUrl;
    });

    if (!result.ok) {
      console.error("Error viewing document:", result.message);
      setViewIssue({ docId: doc.id, message: result.message, url: result.url });
    }
    setLoadingDoc(null);
  };

  const renderViewIssue = (docId: string, title: string) =>
    viewIssue?.docId === docId ? (
      <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 flex items-start gap-1">
        <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
        <span>
          {viewIssue.message}{" "}
          {viewIssue.url && (
            <a
              href={viewIssue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-700 underline"
            >
              Open {title}
            </a>
          )}
        </span>
      </div>
    ) : null;

  const isExpired = (expiryDate: string | null | undefined) => {
    if (!expiryDate) return false;
    return new Date(expiryDate) < new Date();
  };

  const formatDateSafe = (dateString: string) => {
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
  
  // Group requirements by module
  const requirementsByModule = documentRequirements.reduce((acc, req) => {
    const key = req.module_id;
    if (!acc[key]) {
      acc[key] = {
        module_title: req.module_title,
        course_title: req.course_title,
        requirements: []
      };
    }
    acc[key].requirements.push(req);
    return acc;
  }, {} as Record<string, { module_title: string; course_title: string; requirements: DocumentRequirement[] }>);

  // Match uploaded documents to requirements
  const getDocumentForRequirement = (requirement: DocumentRequirement) => {
    // Try to match by block_id first (most specific)
    let matchingDoc = documents.find(doc => 
      doc.block_id === requirement.id && doc.module_id === requirement.module_id
    );
    
    // If no block_id match, try to match by title and module
    if (!matchingDoc) {
      matchingDoc = documents.find(doc => {
        if (doc.module_id !== requirement.module_id) return false;
        
        const docTitle = doc.title.toLowerCase();
        const reqLabel = requirement.label.toLowerCase();
        
        // Check for partial matches in document title
        return docTitle.includes("type familiarisation") && reqLabel.includes("type familiarisation") ||
               docTitle.includes("caa 24061") && reqLabel.includes("caa 24061") ||
               docTitle.includes("log book") && reqLabel.includes("log book") ||
               docTitle.includes(reqLabel) || reqLabel.includes(docTitle);
      });
    }
    
    return matchingDoc;
  };
  
  const toggleModule = (moduleId: string) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId);
    } else {
      newExpanded.add(moduleId);
    }
    setExpandedModules(newExpanded);
  };
  
  // Calculate statistics
  const stats = {
    total: documentRequirements.length,
    uploaded: documentRequirements.filter(req => !!getDocumentForRequirement(req)).length,
    missing: documentRequirements.filter(req => !getDocumentForRequirement(req)).length,
    expired: documentRequirements.filter(req => {
      const doc = getDocumentForRequirement(req);
      return doc && doc.expires_on && isExpired(doc.expires_on);
    }).length
  };

  // If no document requirements are configured, show a simple message
  if (documentRequirements.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-2">Document Requirements Summary</h2>
        <p className="text-sm text-gray-600">
          No specific document upload requirements configured for the courses in this authorization.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Document Requirements Summary</h2>
        
        {/* Statistics Bar */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
            <FileText className="w-4 h-4 text-gray-500" />
            <div>
              <div className="text-xs text-gray-500">Total Required</div>
              <div className="font-semibold">{stats.total}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-2 bg-green-50 rounded">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <div>
              <div className="text-xs text-green-600">Uploaded</div>
              <div className="font-semibold text-green-700">{stats.uploaded}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-2 bg-red-50 rounded">
            <XCircle className="w-4 h-4 text-red-600" />
            <div>
              <div className="text-xs text-red-600">Missing</div>
              <div className="font-semibold text-red-700">{stats.missing}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-2 bg-orange-50 rounded">
            <AlertCircle className="w-4 h-4 text-orange-600" />
            <div>
              <div className="text-xs text-orange-600">Expired</div>
              <div className="font-semibold text-orange-700">{stats.expired}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Requirements by Module */}
      <div className="space-y-3">
        {Object.entries(requirementsByModule).map(([moduleId, moduleData]) => {
          const isExpanded = expandedModules.has(moduleId) || Object.keys(requirementsByModule).length === 1;
          const moduleStats = {
            uploaded: moduleData.requirements.filter(req => !!getDocumentForRequirement(req)).length,
            total: moduleData.requirements.length
          };
          
          return (
            <div key={moduleId} className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleModule(moduleId)}
                className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-gray-500" />
                  <div className="text-left">
                    <div className="font-medium">{moduleData.module_title}</div>
                    <div className="text-xs text-gray-500">{moduleData.course_title}</div>
                  </div>
                  <span className="text-sm text-gray-500">
                    ({moduleStats.uploaded}/{moduleStats.total})
                  </span>
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {isExpanded && (
                <div className="p-4 space-y-2">
                  {moduleData.requirements.map((req) => {
                    const doc = getDocumentForRequirement(req);
                    const status = !doc ? "missing" : 
                                   (req.require_expiry && doc.expires_on && isExpired(doc.expires_on)) ? "expired" : 
                                   "uploaded";
                    
                    return (
                      <div
                        key={req.id}
                        className={`p-3 rounded border ${
                          status === "missing" ? "bg-red-50 border-red-200" : 
                          status === "expired" ? "bg-orange-50 border-orange-200" : 
                          "bg-green-50 border-green-200"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              {/* Status Icon */}
                              {status === "uploaded" && <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />}
                              {status === "missing" && <Upload className="w-4 h-4 text-red-600 flex-shrink-0" />}
                              {status === "expired" && <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0" />}
                              
                              {/* Requirement Label */}
                              <span className={`font-medium ${status === "missing" ? "text-red-900" : ""}`}>
                                {req.label}
                              </span>
                              
                              {/* Status Badge */}
                              {status === "missing" && (
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                                  Missing
                                </span>
                              )}
                              {status === "expired" && (
                                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
                                  Expired
                                </span>
                              )}
                            </div>
                            
                            {/* Requirement Details */}
                            {req.require_expiry && (
                              <p className="text-xs text-gray-600 mt-1 ml-6">
                                * Requires expiry date
                              </p>
                            )}
                            
                            {/* Document Details if Uploaded */}
                            {doc && (
                              <div className="ml-6 mt-2 text-xs text-gray-500 space-y-1">
                                <div className="font-medium text-gray-700">
                                  Uploaded as: "{doc.title}"
                                </div>
                                <div>Uploaded: {formatDateSafe(doc.created_at)}</div>
                                {doc.expires_on && (
                                  <div className={status === "expired" ? "text-orange-600 font-medium" : ""}>
                                    Expires: {formatDateSafe(doc.expires_on)}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {/* View Button if Document Exists */}
                          {doc && (
                            <button
                              onClick={() => handleViewDocument(doc)}
                              disabled={loadingDoc === doc.id}
                              className="ml-4 flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                          )}
                        </div>
                        {doc && renderViewIssue(doc.id, doc.title)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Additional Uploaded Documents (not matching any requirement) */}
      {documents.some(doc => {
        const isMatched = documentRequirements.some(req => {
          const matchedDoc = getDocumentForRequirement(req);
          return matchedDoc && matchedDoc.id === doc.id;
        });
        return !isMatched;
      }) && (
        <div className="mt-4 pt-4 border-t">
          <h3 className="font-medium text-gray-700 mb-2">Additional Documents (Not Required)</h3>
          <div className="space-y-2">
            {documents
              .filter(doc => {
                const isMatched = documentRequirements.some(req => {
                  const matchedDoc = getDocumentForRequirement(req);
                  return matchedDoc && matchedDoc.id === doc.id;
                });
                return !isMatched;
              })
              .map(doc => (
                <div key={doc.id} className="p-3 bg-gray-50 rounded border border-gray-200">
                  <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="text-sm font-medium">{doc.title}</div>
                      <div className="text-xs text-gray-500">
                        {doc.course_title} • {doc.module_title} • Uploaded: {formatDateSafe(doc.created_at)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleViewDocument(doc)}
                    disabled={loadingDoc === doc.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                  {renderViewIssue(doc.id, doc.title)}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}