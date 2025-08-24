// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "./lib/supabase/types";

/**
 * Keeps the Supabase session in sync via cookies so
 * server components (getUser) can read it.
 * We intentionally skip ALL /api/* routes to avoid
 * interfering with raw Node req/res handlers (e.g., the Teams bot).
 */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  try {
    const supabase = createMiddlewareClient<Database>({ req, res });
    // This only sets/refreshes cookies; it does NOT read the request body.
    await supabase.auth.getSession();
  } catch {
    // Ignore middleware auth errors; never block the request pipeline
  }

  return res;
}

/**
 * Run middleware on everything EXCEPT:
 * - /api/* (including /api/teams/bot/messages)
 * - Next.js internals and static assets
 */
export const config = {
  matcher: [
    // negative-lookahead to exclude these prefixes
    "/((?!api/|_next/|static/|public/|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
