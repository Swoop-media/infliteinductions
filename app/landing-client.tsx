"use client";

import { useState } from "react";
import Link from "next/link";

export default function LandingClient() {
  const [isLoading, setIsLoading] = useState(false);
  const [showExternalLogin, setShowExternalLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleMicrosoftLogin = async () => {
    setIsLoading(true);
    setError("");
    try {
      // Redirect to Microsoft OAuth
      window.location.href = '/api/auth/microsoft/login';
    } catch (err) {
      console.error('Login error:', err);
      setError("Failed to initiate Microsoft login");
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
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
      setError((err as any).message || "Invalid email or password");
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">INFLITE Induction & Training</h1>
          <p className="text-gray-600">Choose your login method</p>
        </div>
        
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        {!showExternalLogin ? (
          <>
            <div className="space-y-3">
              <button
                onClick={handleMicrosoftLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 rounded-md bg-blue-600 py-3 px-6 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="w-full rounded-md border border-gray-300 py-3 px-6 text-gray-700 hover:bg-gray-50"
              >
                Login with Email (External Users)
              </button>
            </div>

            <p className="text-center text-sm text-gray-600">
              Internal employees use Microsoft login<br />
              External contractors use email login
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
            </form>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => setShowExternalLogin(false)}
                className="text-blue-600 hover:text-blue-500"
              >
                ← Back to login options
              </button>
              <Link href="/app/auth/register" className="text-blue-600 hover:text-blue-500">
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