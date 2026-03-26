// @ts-nocheck

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function SignIn() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showExternalLogin, setShowExternalLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    // Check for error or message in URL params
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get("error");
    const messageParam = urlParams.get("message");
    
    if (errorParam === "auth_failed") {
      setError("Authentication failed. Please try again.");
    } else if (errorParam === "missing_code") {
      setError("Authentication was cancelled or failed.");
    }
    
    // Show success message if coming from signup
    if (messageParam) {
      setError(""); // Clear any errors
      setSuccess(messageParam);
    }
  }, []);

  const handleMicrosoftLogin = async (forceNewAccount = false) => {
    setIsLoading(true);
    setError("");

    try {
      // Redirect to Microsoft OAuth with optional prompt parameter
      const authUrl = forceNewAccount 
        ? `/api/auth/microsoft/login?prompt=login`
        : `/api/auth/microsoft/login`;
      window.location.href = authUrl;
    } catch (err) {
      setError("Failed to initiate Microsoft login");
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      // Import Supabase client
      const { supabaseBrowser } = await import("@/lib/supabase/client");
      
      const { data, error: authError } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      if (data.user) {
        // Redirect to the main app
        window.location.href = "/app";
      }
    } catch (err) {
      setError(err.message || "Invalid email or password");
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-sm space-y-4 rounded-md border bg-white p-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold">INFLITE Induction & Training</h1>
          <p className="text-sm text-gray-600 mt-2">
            Choose your login method
          </p>
        </div>
        
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        {success && (
          <div className="p-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded-md">
            {success}
          </div>
        )}

        {!showExternalLogin ? (
          <>
            <button
              onClick={() => handleMicrosoftLogin()}
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
              {isLoading ? "Signing in..." : "Login with Microsoft (Internal Employees)"}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">OR</span>
              </div>
            </div>

            <button
              onClick={() => setShowExternalLogin(true)}
              className="w-full rounded-md border border-gray-300 py-3 px-4 text-gray-700 hover:bg-gray-50"
            >
              Login with Email (External Users)
            </button>

            <p className="text-center text-sm text-gray-600">
              Don't have an account?{' '}
              <Link href="/auth/signup" className="font-medium text-blue-600 hover:text-blue-500">
                Sign Up
              </Link>
            </p>
          </>
        ) : (
          <>
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your email"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your password"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-md bg-blue-600 py-2 px-4 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Signing in..." : "Sign in"}
              </button>

              <div className="text-center">
                <a href="/auth/reset-password" className="text-sm text-blue-600 hover:text-blue-700">
                  Forgot your password?
                </a>
              </div>
            </form>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => setShowExternalLogin(false)}
                className="text-blue-600 hover:text-blue-500"
              >
                ← Back to login options
              </button>
              <Link href="/auth/signup" className="text-blue-600 hover:text-blue-500">
                Create account
              </Link>
            </div>
          </>
        )}

        <div className="text-xs text-gray-500 text-center">
          <p>Internal employees use Microsoft login</p>
          <p>External contractors use email login</p>
        </div>
      </div>
    </main>
  );
}
