// @ts-nocheck
// app/api/auth/microsoft/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { msalInstance, AUTH_CODE_URL_PARAMETERS } from "@/lib/auth/microsoft";

export async function GET(req: NextRequest) {
  try {
    // Use the actual request host for the redirect URI
    const host = req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const siteUrl = `${protocol}://${host}`;
    
    // Get the authorization URL with dynamic redirect URI
    // Force account selection for shared computers
    const authCodeUrlParameters = {
      ...AUTH_CODE_URL_PARAMETERS,
      redirectUri: `${siteUrl}/auth/callback`,
      prompt: 'select_account', // Forces account picker even with cached sessions
    };

    const authUrl = await msalInstance.getAuthCodeUrl(authCodeUrlParameters);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("Microsoft login initiation error:", error);
    const host = req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const siteUrl = `${protocol}://${host}`;
    return NextResponse.redirect(new URL("/auth/signin?error=auth_failed", siteUrl));
  }
}