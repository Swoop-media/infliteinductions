// @ts-nocheck

// app/auth/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { msalInstance } from "@/lib/auth/microsoft";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseRoute } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  // Always use the actual request host, not environment variable
  const host = req.headers.get('host');
  const protocol = req.headers.get('x-forwarded-proto') || 'https';
  const siteUrl = `${protocol}://${host}`;

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

    // Check if user already exists - try to create first and handle duplicate gracefully
    let userId: string;
    let existingUser = false;

    try {
      // Try to create new user first
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true, // Skip email verification for Microsoft SSO
        user_metadata: {
          name: name || email.split("@")[0],
          microsoft_id: homeAccountId,
        },
      });

      if (authError) {
        // If user already exists, find them
        if (authError.message?.includes('already been registered') || authError.message?.includes('email_exists')) {
          console.log(`User with email ${email} already exists, finding existing user...`);
          existingUser = true;
          
          // Search for existing user by email with pagination - more thorough approach
          let page = 1;
          let foundUser = null;
          const maxPages = 20; // Increased from 10 to handle larger user bases
          
          while (!foundUser && page <= maxPages) {
            const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({
              page,
              perPage: 1000
            });
            
            if (listError) {
              console.error(`Error listing users on page ${page}:`, listError);
              throw listError;
            }
            
            // Case-insensitive email search
            foundUser = users?.find((u: any) => 
              u.email?.toLowerCase() === email.toLowerCase()
            );
            
            console.log(`Page ${page}: Found ${users?.length || 0} users, target user found: ${!!foundUser}`);
            
            if (!foundUser && users && users.length === 1000) {
              page++;
            } else {
              break;
            }
          }
          
          if (!foundUser) {
            // Create a manual user record with temp password - different approach
            console.log(`Creating manual user for ${email} with temp password...`);
            const tempPassword = crypto.randomUUID() + crypto.randomUUID();
            
            const { data: manualUser, error: manualError } = await supabase.auth.admin.createUser({
              email,
              password: tempPassword,
              email_confirm: true,
              user_metadata: {
                name: name || email.split("@")[0],
                microsoft_id: homeAccountId,
                created_via: 'microsoft_sso'
              },
            });
            
            if (manualError) {
              console.error('User creation error:', manualError);
              throw new Error('Could not create or find user');
            }
            
            userId = manualUser.user.id;
          } else {
            userId = foundUser.id;
            
            // Update user metadata to include Microsoft ID if not already set
            const currentMetadata = foundUser.user_metadata || {};
            if (!currentMetadata.microsoft_id) {
              await supabase.auth.admin.updateUserById(userId, {
                user_metadata: {
                  ...currentMetadata,
                  microsoft_id: homeAccountId,
                },
              });
            }
          }
        } else {
          throw authError;
        }
      } else {
        // New user created successfully
        userId = authUser.user.id;
      }
    } catch (createError) {
      throw createError;
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

    // Create a temporary password for session establishment
    const tempPassword = crypto.randomUUID();
    
    // Update the user with the temporary password
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: tempPassword,
    });

    if (updateError) {
      console.error("Password update error:", updateError);
      throw new Error("Could not create session");
    }

    // Redirect to auth confirmation page that will sign in with the temp password
    const redirectUrl = new URL("/auth/confirm", siteUrl);
    redirectUrl.searchParams.set("email", email);
    redirectUrl.searchParams.set("password", tempPassword);
    redirectUrl.searchParams.set("next", "/app/home");
    
    console.log("Microsoft auth successful, redirecting to confirm:", redirectUrl.toString());
    return NextResponse.redirect(redirectUrl);

  } catch (error) {
    console.error("Microsoft auth callback error:", error);
    const host = req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const errorSiteUrl = `${protocol}://${host}`;
    return NextResponse.redirect(new URL("/auth/signin?error=auth_failed", errorSiteUrl));
  }
}
