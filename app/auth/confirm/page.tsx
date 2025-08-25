
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function AuthConfirm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient();

  useEffect(() => {
    const confirmAuth = async () => {
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      const next = searchParams.get("next") || "/app/home";

      if (tokenHash && type) {
        try {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as any,
          });

          if (error) {
            console.error("Session confirmation error:", error);
            router.push("/auth/signin?error=session_failed");
            return;
          }

          // Session established successfully
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
