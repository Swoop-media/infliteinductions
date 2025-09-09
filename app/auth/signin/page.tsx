// @ts-nocheck

"use client";

import { useEffect, useState } from "react";

export default function SignIn() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Check for error in URL params
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get("error");
    if (errorParam === "auth_failed") {
      setError("Authentication failed. Please try again.");
    } else if (errorParam === "missing_code") {
      setError("Authentication was cancelled or failed.");
    }
  }, []);

  const handleMicrosoftLogin = async () => {
    setIsLoading(true);
    setError("");

    try {
      // Redirect to Microsoft OAuth
      const authUrl = `/api/auth/microsoft/login`;
      window.location.href = authUrl;
    } catch (err) {
      setError("Failed to initiate Microsoft login");
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-sm space-y-4 rounded-md border bg-white p-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold">Welcome</h1>
          <p className="text-sm text-gray-600 mt-2">
            Sign in with your Microsoft account to access the learning platform
          </p>
        </div>
        
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        <button
          onClick={handleMicrosoftLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 rounded-md bg-blue-600 py-3 px-4 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 23 23" fill="currentColor">
              <path d="M11.03 0H0v11.03h11.03V0z"/>
              <path d="M23 0H11.97v11.03H23V0z"/>
              <path d="M11.03 11.97H0V23h11.03V11.97z"/>
              <path d="M23 11.97H11.97V23H23V11.97z"/>
            </svg>
          )}
          {isLoading ? "Signing in..." : "Continue with Microsoft"}
        </button>

        <div className="text-xs text-gray-500 text-center">
          Only users from your organization can access this platform
        </div>
      </div>
    </main>
  );
}
