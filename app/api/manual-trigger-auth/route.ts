// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    // Use admin client to bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ 
        error: "Server configuration error" 
      }, { status: 500 });
    }
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      // Hard cap on Supabase HTTP round-trips so connection blips can't hang
      // requests indefinitely and saturate the VM (Aug 2026 outages).
      global: {
        fetch: (input: any, init?: any) =>
          fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000) }),
      },
    });

    // Test user data - load from environment variables
    const testUserId = process.env.TEST_USER_ID;
    const authId = process.env.TEST_AUTH_ID;
    
    if (!testUserId || !authId) {
      return NextResponse.json({ 
        error: "Test configuration missing" 
      }, { status: 500 });
    }

    console.log("Manually triggering authorization to pending_approval...");

    // Update the authorization assignment directly to pending_approval
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("authorisation_assignments")
      .update({
        assignment_status: 'pending_approval',
        completed_at: new Date().toISOString()
      })
      .eq("user_id", testUserId)
      .eq("authorisation_id", authId)
      .eq("role", "trainee")
      .select()
      .single();

    if (updateError) {
      console.error("Error updating authorization:", updateError);
      return NextResponse.json({ 
        error: "Failed to update authorization",
        details: updateError.message 
      }, { status: 500 });
    }

    console.log("Authorization updated:", updated);

    return NextResponse.json({
      success: true,
      message: "Authorization moved to pending_approval",
      authorization: updated
    });

  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ 
      error: "Failed to update authorization",
      details: error.message 
    }, { status: 500 });
  }
}