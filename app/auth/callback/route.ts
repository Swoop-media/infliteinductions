
// app/auth/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { msalInstance } from "@/lib/auth/microsoft";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase admin env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${req.headers.get('host')}`;
    return NextResponse.redirect(new URL("/auth/signin?error=missing_code", siteUrl));
  }

  try {
    // Exchange code for tokens
    const tokenRequest = {
      code,
      scopes: ["openid", "profile", "email", "User.Read"],
      redirectUri: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    };

    const response = await msalInstance.acquireTokenByCode(tokenRequest);
    
    if (!response?.account) {
      throw new Error("No account information received");
    }

    const { homeAccountId, username, name } = response.account;
    const email = username; // In MSAL, username is typically the email

    // Create Supabase auth user first
    const supabase = supabaseAdmin();
    
    // Create or get auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        name: name || email.split("@")[0],
        microsoft_id: homeAccountId,
      },
    });

    if (authError && !authError.message.includes("already registered")) {
      throw authError;
    }

    // Get the user ID from auth
    let userId = authUser?.user?.id;
    
    if (!userId) {
      // If user already exists, get their ID
      const { data: existingAuthUser } = await supabase.auth.admin.getUserByEmail(email);
      userId = existingAuthUser.user?.id;
    }

    if (!userId) {
      throw new Error("Could not create or find user");
    }

    // Check if profile exists and create/update it
    let { data: existingProfile } = await supabase
      .from("profiles")
      .select("id, email, microsoft_id")
      .eq("id", userId)
      .maybeSingle();

    if (existingProfile) {
      // Update existing profile with Microsoft ID if not set
      if (!existingProfile.microsoft_id) {
        await supabase
          .from("profiles")
          .update({ microsoft_id: homeAccountId })
          .eq("id", userId);
      }
    } else {
      // Create new profile
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          email,
          name: name || email.split("@")[0],
          microsoft_id: homeAccountId,
        });

      if (profileError && !profileError.message.includes("duplicate")) {
        console.warn("Profile creation error:", profileError);
        // Don't throw - profile might be created by trigger
      }
    }

    // Generate session token
    const { data: session, error: sessionError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (sessionError) throw sessionError;

    // Redirect to app with session
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${req.headers.get('host')}`;
    const redirectUrl = new URL("/app/home", siteUrl);
    const response_redirect = NextResponse.redirect(redirectUrl);
    
    // Set session cookie (you may need to implement proper session handling)
    response_redirect.cookies.set("sb-access-token", session.properties?.access_token || "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });

    return response_redirect;

  } catch (error) {
    console.error("Microsoft auth callback error:", error);
    // Use the site URL from env instead of req.url to avoid 0.0.0.0 issues
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${req.headers.get('host')}`;
    return NextResponse.redirect(new URL("/auth/signin?error=auth_failed", siteUrl));
  }
}
