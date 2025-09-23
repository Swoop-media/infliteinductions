
// @ts-nocheck
"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@/lib/supabase/client";

function AuthConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient();

  useEffect(() => {
    const confirmAuth = async () => {
      const email = searchParams.get("email");
      const password = searchParams.get("password");
      const next = searchParams.get("next") || "/app/home";

      if (email && password) {
        try {
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            console.error("Session confirmation error:", error);
            router.push("/auth/signin?error=session_failed");
            return;
          }

          // Session established successfully, clean up URL and redirect
          window.history.replaceState({}, document.title, "/auth/confirm");
          router.push(next);
        } catch (error) {
          console.error("Auth confirmation error:", error);
          router.push("/auth/signin?error=session_failed");
        }
      } else {
        // Missing parameters, redirect to signin
        router.push("/auth/signin");
      }
    };

    confirmAuth();
  }, [searchParams, router, supabase]);

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p>Completing sign in...</p>
      </div>
    </div>
  );
}

export default function AuthConfirm() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AuthConfirmContent />
    </Suspense>
  );
}
