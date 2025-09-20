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
  } catch (error: any) {
    // Handle rate limiting errors
    if (error?.status === 429 || error?.code === 'over_request_rate_limit') {
      console.error('Auth rate limit hit - skipping session refresh');
      // Don't try to refresh, just continue with existing session
      return res;
    }
    
    // Handle connection/timeout errors
    if (error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || 
        error?.cause?.code === 'UND_ERR_SOCKET') {
      console.error('Auth service connection error - skipping session refresh');
      return res;
    }
    
    // Handle specific refresh token errors by clearing auth cookies
    if (error?.code === 'refresh_token_not_found' || error?.message?.includes('refresh_token_not_found')) {
      console.log('Clearing invalid refresh token cookies');
      
      // Clear Supabase auth cookies
      res.cookies.delete('supabase-auth-token');
      res.cookies.delete('sb-auth-token');
      res.cookies.delete('supabase-auth-token-code-verifier');
      
      // If this is a page request (not API), redirect to login
      if (!req.nextUrl.pathname.startsWith('/api') && 
          !req.nextUrl.pathname.startsWith('/auth') && 
          req.nextUrl.pathname !== '/') {
        const loginUrl = new URL('/auth/login', req.url);
        return NextResponse.redirect(loginUrl);
      }
    }
    
    // Ignore other middleware auth errors; never block the request pipeline
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