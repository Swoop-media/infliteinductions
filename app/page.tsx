// @ts-nocheck

"use client";

import { useState } from "react";

export default function Landing() {
  const [isLoading, setIsLoading] = useState(false);

  const handleMicrosoftLogin = async () => {
    setIsLoading(true);
    try {
      // Redirect to Microsoft OAuth
      window.location.href = '/api/auth/microsoft/login';
    } catch (err) {
      console.error('Login error:', err);
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">INFLITE Induction & Training</h1>
          <p className="text-gray-600">Sign in with your Microsoft account to continue.</p>
        </div>
        <div className="flex justify-center">
          <button
            onClick={handleMicrosoftLogin}
            disabled={isLoading}
            className="flex items-center justify-center gap-3 rounded-md bg-blue-600 py-3 px-6 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
            {isLoading ? "Signing in..." : "Login with Microsoft"}
          </button>
        </div>
        <div className="text-xs text-gray-500 text-center">
          Only users from your organization can access this platform
        </div>
      </div>
    </main>
  );
}
