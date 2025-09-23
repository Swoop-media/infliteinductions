// @ts-nocheck

import { NextRequest, NextResponse } from "next/server";
import { msalInstance } from "@/lib/auth/microsoft";
import { createRouteHandlerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const { url, courseId } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Parse the URL to determine the type
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Check if it's a SharePoint or Microsoft Stream URL
    const isSharePoint = hostname.includes(".sharepoint.com") || hostname.includes("onedrive");
    const isStream = hostname.includes("stream.microsoft.com") || hostname.includes("microsoftstream.com");

    if (!isSharePoint && !isStream) {
      // For non-Microsoft URLs, just return the URL as-is
      return NextResponse.json({ 
        embedUrl: url,
        requiresAuth: false 
      });
    }

    // Get the current user's session from Supabase
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ 
        error: "User not authenticated",
        requiresAuth: true 
      }, { status: 401 });
    }

    // Get user's Microsoft account info from metadata
    const microsoftId = user.user_metadata?.microsoft_id;
    const email = user.email;

    if (!microsoftId && !email) {
      return NextResponse.json({ 
        error: "Microsoft account information not found",
        requiresAuth: true 
      }, { status: 400 });
    }

    try {
      // Try to acquire a token silently for SharePoint access
      // We need to request appropriate scopes for SharePoint/OneDrive access
      const scopes = [
        "https://graph.microsoft.com/Files.Read",
        "https://graph.microsoft.com/Files.Read.All",
        "https://graph.microsoft.com/Sites.Read.All",
        "offline_access"
      ];

      // For SharePoint embedded videos, we need to ensure the URL has the correct parameters
      if (isSharePoint) {
        // Check if it's already an embed URL
        if (urlObj.pathname.includes("/_layouts/15/embed.aspx")) {
          // It's already an embed URL, just ensure parent parameter is set
          const host = request.headers.get("host");
          const protocol = request.headers.get("x-forwarded-proto") || "https";
          const currentOrigin = `${protocol}://${host}`;
          
          urlObj.searchParams.set("parent", currentOrigin);
          
          // Add authentication hint to help with SSO
          if (email) {
            urlObj.searchParams.set("login_hint", email);
          }
          
          return NextResponse.json({ 
            embedUrl: urlObj.toString(),
            requiresAuth: true,
            authHint: "SharePoint SSO should work if user is already authenticated"
          });
        } else {
          // Try to convert to embed URL if possible
          // SharePoint video URLs can be complex, so we'll return the original
          // and let the client handle authentication via popup if needed
          return NextResponse.json({ 
            embedUrl: url,
            requiresAuth: true,
            suggestion: "Direct embed may require authentication popup",
            fallbackUrl: url
          });
        }
      }

      // For Microsoft Stream
      if (isStream) {
        // Stream videos should work with SSO if the user is authenticated
        // Add login hint to help with SSO
        if (email) {
          urlObj.searchParams.set("login_hint", email);
        }
        
        return NextResponse.json({ 
          embedUrl: urlObj.toString(),
          requiresAuth: true,
          authHint: "Microsoft Stream SSO should work automatically"
        });
      }

      return NextResponse.json({ 
        embedUrl: url,
        requiresAuth: false 
      });

    } catch (tokenError: any) {
      console.error("Token acquisition error:", tokenError);
      
      // If we can't get a token, return the URL anyway
      // The iframe might still work if the user has an active session
      return NextResponse.json({ 
        embedUrl: url,
        requiresAuth: true,
        warning: "Could not acquire token, relying on browser session",
        suggestion: "User may need to authenticate in a popup first"
      });
    }

  } catch (error: any) {
    console.error("Video auth error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error.message 
    }, { status: 500 });
  }
}