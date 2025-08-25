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

    // Use route handler client to establish session with proper cookies
    const cookieStore = await cookies();
    const routeSupabase = createRouteHandlerClient({ cookies: () => cookieStore });

    // For existing users, sign them in directly using admin privileges
    if (existingAuthUser) {
      // Generate a session token for the existing user
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "signup",
        email,
        options: {
          redirectTo: `${siteUrl}/app/home`,
        },
      });

      if (linkError) {
        console.error("Link generation error:", linkError);
        // Fallback: redirect with a success flag and let client handle auth
        const redirectUrl = new URL("/app/home", siteUrl);
        redirectUrl.searchParams.set("auth", "success");
        return NextResponse.redirect(redirectUrl);
      }

      // Extract and verify the session
      const linkUrl = new URL(linkData.properties.action_link);
      const tokenHash = linkUrl.searchParams.get('token_hash');
      const type = linkUrl.searchParams.get('type');

      if (tokenHash && type) {
        try {
          const { error: verifyError } = await routeSupabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as any,
          });

          if (!verifyError) {
            return NextResponse.redirect(new URL("/app/home", siteUrl));
          }
        } catch (verifyError) {
          console.warn("Session verification failed:", verifyError);
        }
      }
    }

    // For new users or if session creation failed, try alternative approach
    try {
      // Create a temporary password and sign in
      const tempPassword = Math.random().toString(36).slice(-12) + "Aa1!";
      
      if (!existingAuthUser) {
        // Update the new user with a temporary password
        await supabase.auth.admin.updateUserById(userId, {
          password: tempPassword,
        });
      } else {
        // Reset password for existing user
        await supabase.auth.admin.updateUserById(userId, {
          password: tempPassword,
        });
      }

      // Sign in with the temporary password
      const { error: signInError } = await routeSupabase.auth.signInWithPassword({
        email,
        password: tempPassword,
      });

      if (!signInError) {
        return NextResponse.redirect(new URL("/app/home", siteUrl));
      }

      console.error("Sign in with password failed:", signInError);
    } catch (passwordError) {
      console.error("Password-based auth failed:", passwordError);
    }

    // Final fallback: redirect to home with auth flag
    const redirectUrl = new URL("/app/home", siteUrl);
    redirectUrl.searchParams.set("auth", "microsoft");
    redirectUrl.searchParams.set("email", email);
    return NextResponse.redirect(redirectUrl);

  } catch (error) {
    console.error("Microsoft auth callback error:", error);
    return NextResponse.redirect(new URL("/auth/signin?error=auth_failed", siteUrl));
  }
}