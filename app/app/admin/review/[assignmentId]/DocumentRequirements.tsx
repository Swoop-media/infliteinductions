"use client";

import { useState } from "react";
import { FileText, ExternalLink, Calendar, AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react";

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

interface RequiredDocument {
  name: string;
  category: string;
  description?: string;
  required: boolean;
  requiresExpiry?: boolean;
}

interface Props {
  documents: Document[];
  courses: Course[];
}

// Define common required documents for aviation training
const COMMON_REQUIRED_DOCUMENTS: RequiredDocument[] = [
  // Medical and Health
  { name: "Medical Certificate", category: "Medical", description: "Valid aviation medical certificate", required: true, requiresExpiry: true },
  { name: "First Aid Certificate", category: "Medical", description: "Current first aid certification", required: false, requiresExpiry: true },
  
  // Licenses and Certifications
  { name: "Pilot License", category: "License", description: "Valid pilot license", required: true, requiresExpiry: true },
  { name: "Type Rating Certificate", category: "License", description: "Aircraft type rating certification", required: true, requiresExpiry: false },
  
  // Training Records
  { name: "Training Manual", category: "Training", description: "Course training manual", required: false },
  { name: "Ground Training Certificate", category: "Training", description: "Ground training completion certificate", required: false },
  { name: "Flight Training Record", category: "Training", description: "Flight hours and training record", required: true },
  
  // Compliance and Safety
  { name: "Safety Certificate", category: "Compliance", description: "Safety training certificate", required: false, requiresExpiry: true },
  { name: "Risk Assessment", category: "Compliance", description: "Risk assessment documentation", required: false },
  { name: "Compliance Report", category: "Compliance", description: "Regulatory compliance documentation", required: false },
  
  // Equipment and Aircraft
  { name: "Aircraft Manual", category: "Equipment", description: "Aircraft operation manual", required: false },
  { name: "Equipment Checklist", category: "Equipment", description: "Equipment verification checklist", required: false }
];

// Map course types to their required documents
const getCourseRequiredDocuments = (courseTitle: string): RequiredDocument[] => {
  const title = courseTitle.toLowerCase();
  const requiredDocs: RequiredDocument[] = [];
  
  // Pacific Aerospace PAC750 Type Rating specific requirements
  if (title.includes("pac750") || title.includes("pac 750") || title.includes("pacific aerospace")) {
    requiredDocs.push(
      { name: "PAC750 Type Rating", category: "License", description: "Pacific Aerospace PAC750 type rating certificate", required: true },
      { name: "PAC750 Ground Training", category: "Training", description: "PAC750 ground training completion", required: true },
      { name: "PAC750 Flight Manual", category: "Equipment", description: "PAC750 aircraft flight manual", required: false }
    );
  }
  
  // General type rating requirements
  if (title.includes("type rating")) {
    requiredDocs.push(
      { name: "Type Rating Certificate", category: "License", description: "Aircraft type rating certification", required: true },
      { name: "Type Rating Training Record", category: "Training", description: "Type rating training completion", required: true }
    );
  }
  
  // Tandem jump requirements
  if (title.includes("tandem")) {
    requiredDocs.push(
      { name: "Tandem Master Certificate", category: "License", description: "Tandem master certification", required: true, requiresExpiry: true },
      { name: "Tandem Equipment Check", category: "Equipment", description: "Tandem equipment verification", required: true }
    );
  }
  
  // Always include basic requirements
  requiredDocs.push(
    { name: "Medical Certificate", category: "Medical", description: "Valid aviation medical certificate", required: true, requiresExpiry: true },
    { name: "Pilot License", category: "License", description: "Valid pilot license", required: true, requiresExpiry: true }
  );
  
  return requiredDocs;
};

export default function DocumentRequirements({ documents, courses }: Props) {
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["License", "Medical"]));

  // Aggregate all required documents from all courses
  const allRequiredDocuments = new Map<string, RequiredDocument>();
  
  courses.forEach(course => {
    const courseRequiredDocs = getCourseRequiredDocuments(course.course_title);
    courseRequiredDocs.forEach(doc => {
      const key = `${doc.name}::${doc.category}`;
      if (!allRequiredDocuments.has(key)) {
        allRequiredDocuments.set(key, doc);
      }
    });
  });
  
  // Convert to array and sort by category and required status
  const requiredDocumentsList = Array.from(allRequiredDocuments.values()).sort((a, b) => {
    if (a.required !== b.required) return b.required ? 1 : -1;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });

  const handleViewDocument = async (doc: Document) => {
    setLoadingDoc(doc.id);
    
    try {
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
  
  // Match uploaded documents to requirements
  const getDocumentStatus = (requirement: RequiredDocument) => {
    // Find matching uploaded document
    const matchingDocs = documents.filter(doc => {
      const docTitle = doc.title.toLowerCase();
      const reqName = requirement.name.toLowerCase();
      
      // Check for exact match or partial match
      return docTitle.includes(reqName) || 
             reqName.includes(docTitle) ||
             (requirement.name === "PAC750 Type Rating" && docTitle.includes("pac750")) ||
             (requirement.name === "PAC750 Ground Training" && docTitle.includes("pac750") && docTitle.includes("ground"));
    });
    
    if (matchingDocs.length === 0) {
      return { status: "missing", doc: null };
    }
    
    // Get the most recent matching document
    const latestDoc = matchingDocs.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
    
    if (requirement.requiresExpiry && latestDoc.expires_on && isExpired(latestDoc.expires_on)) {
      return { status: "expired", doc: latestDoc };
    }
    
    return { status: "uploaded", doc: latestDoc };
  };
  
  // Group documents by category
  const documentsByCategory = requiredDocumentsList.reduce((acc, req) => {
    if (!acc[req.category]) {
      acc[req.category] = [];
    }
    acc[req.category].push(req);
    return acc;
  }, {} as Record<string, RequiredDocument[]>);
  
  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };
  
  // Calculate statistics
  const stats = {
    total: requiredDocumentsList.length,
    required: requiredDocumentsList.filter(d => d.required).length,
    uploaded: requiredDocumentsList.filter(d => getDocumentStatus(d).status === "uploaded").length,
    missing: requiredDocumentsList.filter(d => getDocumentStatus(d).status === "missing").length,
    expired: requiredDocumentsList.filter(d => getDocumentStatus(d).status === "expired").length
  };

  return (
    <div className="rounded-xl border bg-white p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Document Requirements Summary</h2>
        
        {/* Statistics Bar */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
            <FileText className="w-4 h-4 text-gray-500" />
            <div>
              <div className="text-xs text-gray-500">Total</div>
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
        
        {/* Legend */}
        <div className="text-xs text-gray-600 space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full"></span>
            <span>Required documents</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            <span>Optional documents</span>
          </div>
        </div>
      </div>

      {/* Document Categories */}
      <div className="space-y-3">
        {Object.entries(documentsByCategory).map(([category, categoryDocs]) => {
          const isExpanded = expandedCategories.has(category);
          const categoryStats = {
            uploaded: categoryDocs.filter(d => getDocumentStatus(d).status === "uploaded").length,
            total: categoryDocs.length
          };
          
          return (
            <div key={category} className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleCategory(category)}
                className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-gray-500" />
                  <span className="font-medium">{category}</span>
                  <span className="text-sm text-gray-500">
                    ({categoryStats.uploaded}/{categoryStats.total})
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
                  {categoryDocs.map((req, idx) => {
                    const { status, doc } = getDocumentStatus(req);
                    
                    return (
                      <div
                        key={`${category}-${idx}`}
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
                              {status === "uploaded" && <CheckCircle className="w-4 h-4 text-green-600" />}
                              {status === "missing" && <XCircle className="w-4 h-4 text-red-600" />}
                              {status === "expired" && <AlertCircle className="w-4 h-4 text-orange-600" />}
                              
                              {/* Document Name */}
                              <span className={`font-medium ${req.required ? "" : "text-gray-700"}`}>
                                {req.name}
                                {req.required && <span className="text-red-500 ml-1">*</span>}
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
                            
                            {/* Description */}
                            {req.description && (
                              <p className="text-xs text-gray-600 mt-1 ml-6">{req.description}</p>
                            )}
                            
                            {/* Document Details if Uploaded */}
                            {doc && (
                              <div className="ml-6 mt-2 text-xs text-gray-500 space-y-1">
                                <div>Uploaded: {formatDateSafe(doc.created_at)}</div>
                                {doc.expires_on && (
                                  <div className={status === "expired" ? "text-orange-600 font-medium" : ""}>
                                    Expires: {formatDateSafe(doc.expires_on)}
                                  </div>
                                )}
                                {doc.course_title && <div>Course: {doc.course_title}</div>}
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
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Additional Uploaded Documents */}
      {documents.some(doc => {
        const isMatched = requiredDocumentsList.some(req => {
          const docTitle = doc.title.toLowerCase();
          const reqName = req.name.toLowerCase();
          return docTitle.includes(reqName) || reqName.includes(docTitle);
        });
        return !isMatched;
      }) && (
        <div className="mt-4 pt-4 border-t">
          <h3 className="font-medium text-gray-700 mb-2">Additional Documents</h3>
          <div className="space-y-2">
            {documents
              .filter(doc => {
                const isMatched = requiredDocumentsList.some(req => {
                  const docTitle = doc.title.toLowerCase();
                  const reqName = req.name.toLowerCase();
                  return docTitle.includes(reqName) || reqName.includes(docTitle);
                });
                return !isMatched;
              })
              .map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="text-sm font-medium">{doc.title}</div>
                      <div className="text-xs text-gray-500">
                        {doc.course_title} • Uploaded: {formatDateSafe(doc.created_at)}
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
              ))}
          </div>
        </div>
      )}
    </div>
  );
}