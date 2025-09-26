// @ts-nocheck

"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle, XCircle, FileText, Link, User } from "lucide-react";

export function DiagnosticTool({ 
  documents, 
  orphaned, 
  locations, 
  issues,
  fixDocumentIssue,
  linkDocumentToAssignment 
}) {
  const [expandedSections, setExpandedSections] = useState({
    overview: true,
    issues: true,
    all: false,
    locations: false,
    orphaned: false
  });
  
  const [fixing, setFixing] = useState(null);
  const [linkingDoc, setLinkingDoc] = useState(null);
  const [assignmentId, setAssignmentId] = useState("");

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleFix = async (issueType, documentId, fixData) => {
    setFixing(documentId);
    try {
      const result = await fixDocumentIssue(issueType, documentId, fixData);
      if (result.success) {
        window.location.reload();
      } else {
        alert(`Failed to fix: ${result.error}`);
      }
    } finally {
      setFixing(null);
    }
  };

  const handleLinkToAssignment = async (documentId) => {
    if (!assignmentId.trim()) {
      alert("Please enter an assignment ID");
      return;
    }
    
    setFixing(documentId);
    try {
      const result = await linkDocumentToAssignment(documentId, assignmentId);
      if (result.success) {
        window.location.reload();
      } else {
        alert(`Failed to link: ${result.error}`);
      }
    } finally {
      setFixing(null);
      setLinkingDoc(null);
      setAssignmentId("");
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high': return 'text-red-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'high': return <XCircle className="h-5 w-5" />;
      case 'medium': return <AlertCircle className="h-5 w-5" />;
      case 'low': return <AlertCircle className="h-5 w-5" />;
      default: return <CheckCircle className="h-5 w-5" />;
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold mb-4">Document Diagnostic Tool</h1>
        <p className="text-gray-600">
          Comprehensive analysis of all documents in the system, their relationships, and visibility locations.
        </p>
      </div>

      {/* Overview Section */}
      <div className="bg-white rounded-lg shadow-md">
        <button
          onClick={() => toggleSection('overview')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            {expandedSections.overview ? <ChevronDown /> : <ChevronRight />}
            <h2 className="text-lg font-semibold">Overview</h2>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
              {documents.length} total documents
            </span>
            <span className="bg-red-100 text-red-800 px-2 py-1 rounded">
              {issues.reduce((sum, i) => sum + i.count, 0)} issues found
            </span>
          </div>
        </button>
        
        {expandedSections.overview && (
          <div className="p-4 border-t">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 p-3 rounded">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-5 w-5 text-blue-600" />
                  <h3 className="font-semibold">MyProfile Documents</h3>
                </div>
                <p className="text-2xl font-bold">{locations.myProfileDocs.length}</p>
                <p className="text-sm text-gray-600">Visible in user profiles</p>
              </div>
              
              <div className="bg-gray-50 p-3 rounded">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-5 w-5 text-yellow-600" />
                  <h3 className="font-semibold">Due Date Documents</h3>
                </div>
                <p className="text-2xl font-bold">{locations.adminDueDates.length}</p>
                <p className="text-sm text-gray-600">With expiry dates</p>
              </div>
              
              <div className="bg-gray-50 p-3 rounded">
                <div className="flex items-center gap-2 mb-2">
                  <Link className="h-5 w-5 text-green-600" />
                  <h3 className="font-semibold">Authorization Documents</h3>
                </div>
                <p className="text-2xl font-bold">{locations.authorizationReviews.length}</p>
                <p className="text-sm text-gray-600">Linked to auth reviews</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Issues Section */}
      <div className="bg-white rounded-lg shadow-md">
        <button
          onClick={() => toggleSection('issues')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            {expandedSections.issues ? <ChevronDown /> : <ChevronRight />}
            <h2 className="text-lg font-semibold">Issues Detected</h2>
          </div>
          <span className="text-sm text-gray-600">
            {issues.length} issue types found
          </span>
        </button>
        
        {expandedSections.issues && (
          <div className="p-4 border-t space-y-4">
            {issues.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <p>No issues detected - all documents are properly linked!</p>
              </div>
            ) : (
              issues.map((issue, idx) => (
                <div key={idx} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={getSeverityColor(issue.severity)}>
                        {getSeverityIcon(issue.severity)}
                      </span>
                      <h3 className="font-semibold">{issue.message}</h3>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      issue.severity === 'high' ? 'bg-red-100 text-red-800' :
                      issue.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      issue.severity === 'low' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {issue.severity}
                    </span>
                  </div>
                  
                  {issue.documents && issue.documents.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm text-gray-600 mb-2">Affected documents:</p>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {issue.documents.map((doc, docIdx) => (
                          <div key={docIdx} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded">
                            <span>{doc.title || doc.id}</span>
                            {issue.type === 'missing_user' && (
                              <button
                                onClick={() => {
                                  const userId = prompt("Enter user ID to assign:");
                                  if (userId) handleFix('missing_user', doc.id, { userId });
                                }}
                                disabled={fixing === doc.id}
                                className="text-blue-600 hover:underline"
                              >
                                {fixing === doc.id ? 'Fixing...' : 'Assign User'}
                              </button>
                            )}
                            {issue.type === 'invalid_assignment' && (
                              <button
                                onClick={() => handleFix('invalid_assignment', doc.id, {})}
                                disabled={fixing === doc.id}
                                className="text-red-600 hover:underline"
                              >
                                {fixing === doc.id ? 'Fixing...' : 'Clear Invalid Link'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* All Documents Section */}
      <div className="bg-white rounded-lg shadow-md">
        <button
          onClick={() => toggleSection('all')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            {expandedSections.all ? <ChevronDown /> : <ChevronRight />}
            <h2 className="text-lg font-semibold">All Documents</h2>
          </div>
          <span className="text-sm text-gray-600">
            {documents.length} documents in database
          </span>
        </button>
        
        {expandedSections.all && (
          <div className="p-4 border-t">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Title</th>
                    <th className="px-3 py-2 text-left">User</th>
                    <th className="px-3 py-2 text-left">Course/Module</th>
                    <th className="px-3 py-2 text-left">Assignment</th>
                    <th className="px-3 py-2 text-left">Expires</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <div>
                          <p className="font-medium">{doc.title || 'Untitled'}</p>
                          <p className="text-xs text-gray-500">{doc.id}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {doc.profiles ? (
                          <div>
                            <p>{doc.profiles.full_name || doc.profiles.email}</p>
                            <p className="text-xs text-gray-500">{doc.user_id}</p>
                          </div>
                        ) : (
                          <span className="text-red-600">No user</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div>
                          <p>{doc.courses?.title || 'No course'}</p>
                          <p className="text-xs text-gray-500">{doc.course_modules?.title || 'No module'}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {doc.assignment_id ? (
                          <div>
                            <p className="text-xs">{doc.assignment_id}</p>
                            {doc.course_assignments ? (
                              <span className="text-green-600 text-xs">Valid</span>
                            ) : (
                              <span className="text-red-600 text-xs">Invalid</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">None</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {doc.expires_on ? new Date(doc.expires_on).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) : 'No expiry'}
                      </td>
                      <td className="px-3 py-2">
                        {linkingDoc === doc.id ? (
                          <div className="flex gap-1">
                            <input
                              type="text"
                              placeholder="Assignment ID"
                              value={assignmentId}
                              onChange={(e) => setAssignmentId(e.target.value)}
                              className="px-2 py-1 border rounded text-xs w-32"
                            />
                            <button
                              onClick={() => handleLinkToAssignment(doc.id)}
                              className="text-green-600 hover:underline text-xs"
                            >
                              Link
                            </button>
                            <button
                              onClick={() => {
                                setLinkingDoc(null);
                                setAssignmentId("");
                              }}
                              className="text-red-600 hover:underline text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setLinkingDoc(doc.id)}
                            className="text-blue-600 hover:underline text-xs"
                          >
                            Link to Assignment
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Location Analysis Section */}
      <div className="bg-white rounded-lg shadow-md">
        <button
          onClick={() => toggleSection('locations')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            {expandedSections.locations ? <ChevronDown /> : <ChevronRight />}
            <h2 className="text-lg font-semibold">Document Locations</h2>
          </div>
          <span className="text-sm text-gray-600">
            Where documents appear in the system
          </span>
        </button>
        
        {expandedSections.locations && (
          <div className="p-4 border-t space-y-4">
            <div>
              <h3 className="font-semibold mb-2">MyProfile Documents ({locations.myProfileDocs.length})</h3>
              <p className="text-sm text-gray-600 mb-2">These appear in user's /app/myprofile/documents</p>
              <div className="bg-gray-50 rounded p-2 max-h-40 overflow-y-auto">
                {locations.myProfileDocs.map((doc, idx) => (
                  <div key={idx} className="text-sm py-1">
                    {doc.profiles?.full_name || 'Unknown'} - {doc.title}
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold mb-2">Admin Due Date Documents ({locations.adminDueDates.length})</h3>
              <p className="text-sm text-gray-600 mb-2">These appear in admin due dates tab</p>
              <div className="bg-gray-50 rounded p-2 max-h-40 overflow-y-auto">
                {locations.adminDueDates.map((doc, idx) => (
                  <div key={idx} className="text-sm py-1">
                    {doc.title} - Expires: {doc.expires_on ? new Date(doc.expires_on).toLocaleDateString() : 'N/A'}
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold mb-2">Authorization Review Documents ({locations.authorizationReviews.length})</h3>
              <p className="text-sm text-gray-600 mb-2">These appear in authorization review pages</p>
              <div className="bg-gray-50 rounded p-2 max-h-40 overflow-y-auto">
                {locations.authorizationReviews.map((doc, idx) => (
                  <div key={idx} className="text-sm py-1">
                    {doc.title} - Assignment: {doc.assignment_id}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h3 className="font-semibold mb-2">Quick Actions</h3>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Refresh Analysis
          </button>
          <a
            href="/app/admin"
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 inline-block"
          >
            Back to Admin
          </a>
          <a
            href="/app/admin/diagnose-authorizations"
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 inline-block"
          >
            Authorization Diagnostics
          </a>
        </div>
      </div>
    </div>
  );
}