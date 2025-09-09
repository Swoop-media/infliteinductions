// @ts-nocheck

"use client";

import { useEffect } from "react";

export default function LoginRedirect() {
  useEffect(() => {
    // Redirect to the correct signin page
    window.location.href = "/auth/signin";
  }, []);

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="text-center">
        <p>Redirecting to sign in...</p>
      </div>
    </div>
  );
}
