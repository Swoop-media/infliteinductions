// app/auth/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { msalInstance } from "@/lib/auth/microsoft";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${req.headers.get('host')}`;

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

    // Use admin client to manage users
    const supabase = supabaseAdmin();

    // Check if user already exists
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

    // Create a proper Supabase session using admin client
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: `${siteUrl}/app/home`
      }
    });

    if (sessionError || !sessionData?.properties?.action_link) {
      console.error("Session generation error:", sessionError);
      throw new Error("Could not generate session");
    }

    // Fix the magic link URL to use the correct domain instead of localhost
    let magicLinkUrl = sessionData.properties.action_link;
    if (magicLinkUrl.includes('localhost:3000')) {
      magicLinkUrl = magicLinkUrl.replace('http://localhost:3000', siteUrl);
    }

    // Redirect to the magic link which will establish the session and then redirect to /app/home
    return NextResponse.redirect(magicLinkUrl);

  } catch (error) {
    console.error("Microsoft auth callback error:", error);
    return NextResponse.redirect(new URL("/auth/signin?error=auth_failed", siteUrl));
  }
}