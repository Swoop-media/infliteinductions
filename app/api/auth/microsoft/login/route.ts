
// app/api/auth/microsoft/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { msalInstance, AUTH_CODE_URL_PARAMETERS } from "@/lib/auth/microsoft";

export async function GET(req: NextRequest) {
  try {
    // Get the authorization URL
    const authCodeUrlParameters = {
      ...AUTH_CODE_URL_PARAMETERS,
      redirectUri: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    };

    const authUrl = await msalInstance.getAuthCodeUrl(authCodeUrlParameters);
    
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("Microsoft login initiation error:", error);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${req.headers.get('host')}`;
    return NextResponse.redirect(new URL("/auth/signin?error=auth_failed", siteUrl));
  }
}
