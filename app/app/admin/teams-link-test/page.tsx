"use client";

import React, { useState, useEffect } from "react";
import { AlertCircle, CheckCircle2, Loader2, Users, Send, XCircle, RefreshCw, Search } from 'lucide-react';
import Link from "next/link";

interface User {
  id: string;
  email: string;
  full_name: string;
  has_teams_link?: boolean;
  teams_user_id?: string;
  last_activity?: string;
}

interface TestResult {
  userId: string;
  email: string;
  full_name: string;
  success: boolean;
  error?: string;
  hasTeamsLink: boolean;
  conversationRefFound: boolean;
  teamsUserId?: string;
  lastActivity?: string;
  diagnostics?: {
    issue: string;
    suggestion: string;
  };
}

export default function TeamsLinkTestPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLinked, setFilterLinked] = useState<"all" | "linked" | "unlinked">("all");

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/teams-link-test/users');
      const data = await response.json();
      
      if (response.ok) {
        setUsers(data.users || []);
      } else {
        setError(data.error || "Failed to load users");
      }
    } catch (err: any) {
      console.error("Error loading users:", err);
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const runTest = async () => {
    if (selectedUsers.size === 0) {
      setError("Please select at least one user to test");
      return;
    }

    setTestLoading(true);
    setError(null);
    setTestResults([]);
    
    try {
      const response = await fetch('/api/teams-link-test/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userIds: Array.from(selectedUsers)
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        setTestResults(data.results || []);
        // Clear selection after successful test
        setSelectedUsers(new Set());
      } else {
        setError(data.error || "Failed to run test");
      }
    } catch (err: any) {
      console.error("Error running test:", err);
      setError(err.message || "An error occurred");
    } finally {
      setTestLoading(false);
    }
  };

  const toggleUser = (userId: string) => {
    const newSet = new Set(selectedUsers);
    if (newSet.has(userId)) {
      newSet.delete(userId);
    } else {
      newSet.add(userId);
    }
    setSelectedUsers(newSet);
  };

  const selectAll = () => {
    const filteredUsers = getFilteredUsers();
    setSelectedUsers(new Set(filteredUsers.map(u => u.id)));
  };

  const clearSelection = () => {
    setSelectedUsers(new Set());
  };

  const getFilteredUsers = () => {
    return users.filter(user => {
      const matchesSearch = searchTerm === "" || 
        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesFilter = 
        filterLinked === "all" ||
        (filterLinked === "linked" && user.has_teams_link) ||
        (filterLinked === "unlinked" && !user.has_teams_link);
      
      return matchesSearch && matchesFilter;
    });
  };

  const filteredUsers = getFilteredUsers();

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <div className="mb-8">
        <Link href="/admin" className="text-blue-600 hover:text-blue-800 mb-4 inline-block">
          ← Back to Admin
        </Link>
        <h1 className="text-2xl font-bold">Teams Link Test Tool</h1>
        <p className="text-gray-600 mt-2">
          Test Microsoft Teams bot connections for selected users and diagnose any issues
        </p>
      </div>

      {/* Test Results Section */}
      {testResults.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Test Results
          </h2>
          
          <div className="space-y-3">
            {testResults.map((result) => (
              <div 
                key={result.userId} 
                className={`border rounded-lg p-4 ${
                  result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {result.success ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      <span className="font-medium">{result.full_name}</span>
                      <span className="text-gray-500 text-sm">({result.email})</span>
                    </div>
                    
                    {result.success ? (
                      <p className="text-green-700">
                        ✅ Message sent successfully via Teams
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-red-700">
                          ❌ {result.error || "Failed to send message"}
                        </p>
                        {result.diagnostics && (
                          <div className="mt-2 p-3 bg-white rounded border border-red-300">
                            <p className="font-medium text-red-800">Issue: {result.diagnostics.issue}</p>
                            <p className="text-sm text-gray-700 mt-1">
                              💡 Suggestion: {result.diagnostics.suggestion}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="mt-2 text-sm text-gray-600">
                      <p>Teams Link: {result.hasTeamsLink ? "✓ Linked" : "✗ Not linked"}</p>
                      {result.conversationRefFound && (
                        <p>Conversation Reference: ✓ Found</p>
                      )}
                      {result.teamsUserId && (
                        <p>Teams User ID: {result.teamsUserId}</p>
                      )}
                      {result.lastActivity && (
                        <p>Last Activity: {new Date(result.lastActivity).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <button
            onClick={() => setTestResults([])}
            className="mt-4 text-sm text-gray-500 hover:text-gray-700"
          >
            Clear Results
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span className="font-medium">Error</span>
          </div>
          <p className="mt-1 text-red-600">{error}</p>
        </div>
      )}

      {/* User Selection Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Select Users to Test
          </h2>
          <button
            onClick={loadUsers}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => setFilterLinked("all")}
              className={`px-4 py-2 rounded-lg ${
                filterLinked === "all" 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Users
            </button>
            <button
              onClick={() => setFilterLinked("linked")}
              className={`px-4 py-2 rounded-lg ${
                filterLinked === "linked" 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Linked Only
            </button>
            <button
              onClick={() => setFilterLinked("unlinked")}
              className={`px-4 py-2 rounded-lg ${
                filterLinked === "unlinked" 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Unlinked Only
            </button>
          </div>
        </div>

        {/* Selection Actions */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-600">
            {selectedUsers.size} of {filteredUsers.length} users selected
          </div>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Select All
            </button>
            <button
              onClick={clearSelection}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Clear Selection
            </button>
          </div>
        </div>

        {/* User List */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Select
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Teams Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Activity
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedUsers.has(user.id)}
                        onChange={() => toggleUser(user.id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {user.full_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {user.email}
                    </td>
                    <td className="px-4 py-3">
                      {user.has_teams_link ? (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                          Linked
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                          Not Linked
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {user.last_activity 
                        ? new Date(user.last_activity).toLocaleDateString()
                        : "Never"
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Test Button */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={runTest}
            disabled={testLoading || selectedUsers.size === 0}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium ${
              testLoading || selectedUsers.size === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {testLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Send className="h-5 w-5" />
                Test Selected Users ({selectedUsers.size})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}