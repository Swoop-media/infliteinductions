
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
    return NextResponse.redirect(new URL("/auth/signin?error=missing_code", req.url));
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

    // Create or update user in Supabase
    const supabase = supabaseAdmin();
    
    // Check if user exists
    let { data: existingUser } = await supabase
      .from("users")
      .select("id, email, microsoft_id")
      .eq("email", email)
      .maybeSingle();

    let userId: string;

    if (existingUser) {
      // Update existing user with Microsoft ID if not set
      if (!existingUser.microsoft_id) {
        await supabase
          .from("users")
          .update({ microsoft_id: homeAccountId })
          .eq("id", existingUser.id);
      }
      userId = existingUser.id;
    } else {
      // Create new user with general role
      const { data: newUser, error } = await supabase
        .from("users")
        .insert({
          email,
          name: name || email.split("@")[0],
          microsoft_id: homeAccountId,
          role: "general", // Default role for new users
        })
        .select("id")
        .single();

      if (error) throw error;
      userId = newUser.id;
    }

    // Create Supabase auth session
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

    // Generate session token
    const { data: session, error: sessionError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (sessionError) throw sessionError;

    // Redirect to app with session
    const redirectUrl = new URL("/app/home", req.url);
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
    return NextResponse.redirect(new URL("/auth/signin?error=auth_failed", req.url));
  }
}
