
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
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${req.headers.get('host')}`;

  // Handle Supabase auth verification (second part of flow)
  if (token_hash && type) {
    try {
      const supabase = supabaseAdmin();
      
      // Verify the session using the token hash
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash,
        type: type as any,
      });

      if (error) {
        console.error("Session verification failed:", error);
        return NextResponse.redirect(new URL("/auth/signin?error=auth_failed", siteUrl));
      }

      // Create a response that will set the session cookie
      const response = NextResponse.redirect(new URL(next || "/app/home", siteUrl));
      
      // Set the session in cookies
      if (data.session) {
        response.cookies.set({
          name: 'sb-access-token',
          value: data.session.access_token,
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: data.session.expires_in || 3600
        });
        
        response.cookies.set({
          name: 'sb-refresh-token',
          value: data.session.refresh_token,
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7 // 7 days
        });
      }

      return response;
    } catch (error) {
      console.error("Auth verification error:", error);
      return NextResponse.redirect(new URL("/auth/signin?error=auth_failed", siteUrl));
    }
  }

  // Handle Microsoft OAuth callback (first part of flow)
  if (!code) {
    return NextResponse.redirect(new URL("/auth/signin?error=missing_code", siteUrl));
  }

  try {
    // Exchange code for tokens
    const tokenRequest = {
      code,
      scopes: ["openid", "profile", "email", "User.Read"],
      redirectUri: `${siteUrl}/auth/callback`,
    };

    const response = await msalInstance.acquireTokenByCode(tokenRequest);

    if (!response?.account) {
      throw new Error("No account information received");
    }

    const { homeAccountId, username, name } = response.account;
    const email = username; // In MSAL, username is typically the email

    // Create Supabase auth user first
    const supabase = supabaseAdmin();

    // Check if user already exists first
    let userId: string;
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

    // Find user by email
    const existingAuthUser = users?.find(u => u.email === email);

    if (existingAuthUser) {
      // User exists, use their ID
      userId = existingAuthUser.id;

      // Update user metadata to include Microsoft ID if not already set
      const currentMetadata = existingAuthUser.user_metadata || {};
      if (!currentMetadata.microsoft_id) {
        await supabase.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...currentMetadata,
            microsoft_id: homeAccountId,
          },
        });
      }
    } else {
      // Create new user
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          name: name || email.split("@")[0],
          microsoft_id: homeAccountId,
        },
      });

      if (authError) {
        throw authError;
      }

      userId = authUser.user.id;
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

    // Create a session directly instead of using magic link
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.createSession({
      user_id: userId,
    });

    if (sessionError || !sessionData.session) {
      throw new Error("Failed to create session");
    }

    // Create response with session cookies
    const redirectResponse = NextResponse.redirect(new URL("/app/home", siteUrl));
    
    // Set the session cookies
    redirectResponse.cookies.set({
      name: 'sb-access-token',
      value: sessionData.session.access_token,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: sessionData.session.expires_in || 3600
    });
    
    redirectResponse.cookies.set({
      name: 'sb-refresh-token',
      value: sessionData.session.refresh_token,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });

    return redirectResponse;

  } catch (error) {
    console.error("Microsoft auth callback error:", error);
    return NextResponse.redirect(new URL("/auth/signin?error=auth_failed", siteUrl));
  }
}
