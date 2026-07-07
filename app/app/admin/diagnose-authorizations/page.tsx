// @ts-nocheck
"use client";

import React, { useState, useCallback } from "react";
import DiagnosticTool from "./DiagnosticTool";
import DiagnosisFilters from "./DiagnosisFilters";
import { AlertCircle, CheckCircle2, Loader2, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import Link from "next/link";

export default function DiagnoseAuthorizationsPage() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  
  const [filters, setFilters] = useState({
    searchTerm: "",
    excludeCompleted: true,
    excludeApproved: true,
    statusFilter: [],
    dateFrom: "",
    dateTo: "",
    authorizationIds: [],
    userIds: []
  });

  const diagnoseAuthorizations = useCallback(async (currentPage = 1) => {
    setLoading(true);
    setError(null);
    setResults([]);
    setStatus("Running optimized diagnosis with filters...");

    try {
      const response = await fetch('/api/diagnose-authorizations-optimized', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...filters,
          page: currentPage,
          pageSize
        })
      });

      const data = await response.json();

      if (response.ok) {
        setResults(data.results || []);
        setTotalCount(data.totalCount || 0);
        setSummary(data.summary);
        setPage(currentPage);
        
        const { needsPendingApproval = 0, needsStatusUpdate = 0, noIssues = 0 } = data.summary || {};
        
        if (data.results.length === 0) {
          setStatus("No authorization issues found with current filters.");
        } else {
          setStatus(
            `Found ${data.results.length} authorizations (Page ${currentPage}/${Math.ceil(data.totalCount / pageSize)}). ` +
            `${needsPendingApproval} need pending approval, ${needsStatusUpdate} need status updates, ${noIssues} have no issues.`
          );
        }
      } else {
        setError(data.error || "Failed to run diagnosis");
        setStatus("Error occurred during diagnosis");
      }
    } catch (err: any) {
      console.error("Error:", err);
      setError(err.message || "An error occurred");
      setStatus("Error occurred during diagnosis");
    } finally {
      setLoading(false);
    }
  }, [filters, pageSize]);

  const fixAuthorization = async (result: any) => {
    try {
      const response = await fetch('/api/fix-single-authorization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          userId: result.userId, 
          authId: result.authId, 
          expectedStatus: result.expectedStatus 
        })
      });

      if (response.ok) {
        // Refresh current page
        await diagnoseAuthorizations(page);
      } else {
        const data = await response.json();
        alert(`Error fixing authorization: ${data.error}`);
      }
    } catch (err: any) {
      console.error("Fix error:", err);
      alert(`Error fixing authorization: ${err.message}`);
    }
  };

  const fixAllIssues = async () => {
    const toFix = results.filter(r => r.needsFix && r.currentStatus !== "completed");
    
    setLoading(true);
    setStatus(`Fixing ${toFix.length} authorization issues...`);
    
    try {
      for (const item of toFix) {
        await fixAuthorization(item);
      }
      setStatus(`Successfully fixed ${toFix.length} issues`);
      // Refresh after fixing all
      await diagnoseAuthorizations(page);
    } catch (err: any) {
      setError(`Error fixing issues: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const runComprehensiveFix = async () => {
    setLoading(true);
    setStatus("Running comprehensive fix for all missing authorization assignments...");
    setError(null);
    
    try {
      const response = await fetch('/api/fix-authorization-assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setStatus(`Successfully fixed ${data.summary.total} authorization assignments (${data.summary.created} created, ${data.summary.updated_to_pending} updated to pending)`);
        // Run diagnosis again to show updated results
        await diagnoseAuthorizations(1);
      } else {
        setError(data.error || "Failed to run comprehensive fix");
      }
    } catch (err: any) {
      setError(`Error running comprehensive fix: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = () => {
    setFilters({
      searchTerm: "",
      excludeCompleted: true,
      excludeApproved: true,
      statusFilter: [],
      dateFrom: "",
      dateTo: "",
      authorizationIds: [],
      userIds: []
    });
    setResults([]);
    setStatus("");
    setSummary(null);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Diagnose Authorization Status Issues</h1>
        <Link href="/app/admin?tab=pending_authorisations" className="text-sm text-blue-600 hover:underline">
          View Pending Authorisations →
        </Link>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="space-y-2">
            <h3 className="font-semibold text-blue-900">Authorization Status Diagnostic Tool</h3>
            <p className="text-sm text-blue-800">
              This optimized tool quickly identifies authorization issues using batched queries and smart filtering:
            </p>
            <ul className="text-sm text-blue-700 space-y-1 ml-4">
              <li>• <strong>Faster Performance:</strong> Uses batched database queries to reduce loading time</li>
              <li>• <strong>Smart Filtering:</strong> Search by user, authorization, status, or date range</li>
              <li>• <strong>Pagination:</strong> Handles large datasets efficiently with page-by-page navigation</li>
              <li>• <strong>Quick Actions:</strong> Fix individual issues or run comprehensive fixes</li>
            </ul>
            <p className="text-sm text-blue-800 mt-2">
              <strong>Comprehensive Fix:</strong> Updates all authorization assignments to pending_approval status where all related courses have been completed.
            </p>
            <p className="text-sm text-blue-800 mt-2">
              <strong>Automatic Fixing:</strong> Stuck authorizations are now corrected automatically — immediately when a learner completes a course, and by a daily safety-net sweep. When the sweep fixes anything, Admins and Senior Management receive a summary notification. This page remains available for manual spot checks.
            </p>
          </div>
        </div>
      </div>

      {/* Filters Section */}
      <DiagnosisFilters
        filters={filters}
        onFiltersChange={setFilters}
        onReset={resetFilters}
        isLoading={loading}
      />

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => diagnoseAuthorizations(1)}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running Diagnosis...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Run Diagnosis
            </>
          )}
        </button>
        
        {results.some(r => r.needsFix) && (
          <button
            onClick={fixAllIssues}
            disabled={loading}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
          >
            Fix All Issues on This Page ({results.filter(r => r.needsFix).length})
          </button>
        )}
        
        <button
          onClick={runComprehensiveFix}
          disabled={loading}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
        >
          Comprehensive Fix (All Users)
        </button>
      </div>

      {/* Status Messages */}
      {status && (
        <div className={`p-4 rounded-lg flex items-center gap-2 ${
          error ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-green-100 text-green-800 border border-green-200'
        }`}>
          {error ? <AlertCircle className="h-5 w-5 flex-shrink-0" /> : <CheckCircle2 className="h-5 w-5 flex-shrink-0" />}
          <span>{status}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-100 text-red-800 rounded-lg border border-red-200">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Summary Statistics */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
            <div className="text-sm text-gray-600">Total Results</div>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg shadow-sm border border-yellow-200">
            <div className="text-2xl font-bold text-yellow-700">{summary.needsPendingApproval}</div>
            <div className="text-sm text-yellow-600">Need Pending Approval</div>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg shadow-sm border border-orange-200">
            <div className="text-2xl font-bold text-orange-700">{summary.needsStatusUpdate}</div>
            <div className="text-sm text-orange-600">Need Status Update</div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg shadow-sm border border-green-200">
            <div className="text-2xl font-bold text-green-700">{summary.noIssues}</div>
            <div className="text-sm text-green-600">No Issues</div>
          </div>
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <DiagnosticTool
          results={results}
          onFix={fixAuthorization}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
          <div className="text-sm text-gray-600">
            Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} results
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => diagnoseAuthorizations(page - 1)}
              disabled={page === 1 || loading}
              className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <span className="px-3 py-1 text-sm font-medium">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => diagnoseAuthorizations(page + 1)}
              disabled={page === totalPages || loading}
              className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}