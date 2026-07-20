// @ts-nocheck

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = 'nodejs';

// Requirement upload paths have the fixed format:
//   requirement-uploads/<assignmentId>/<requirementId>/<uuid>.<ext>
// We parse the assignmentId from position 1 to authorise the caller.
const REQUIREMENT_PATH_RE = /^requirement-uploads\/([^/]+)\//;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // Check authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get('path');
    
    if (!filePath) {
      return NextResponse.json({ error: 'File path required' }, { status: 400 });
    }

    // Validate path shape and extract assignmentId
    const pathMatch = REQUIREMENT_PATH_RE.exec(filePath);
    if (!pathMatch) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 403 });
    }
    const assignmentId = pathMatch[1];

    // --- Entitlement check ---
    const adminClient = supabaseAdmin();

    // Fetch the assignment to determine the trainee and course
    const { data: assignment, error: assignmentError } = await adminClient
      .from("course_assignments")
      .select("user_id, course_id")
      .eq("id", assignmentId)
      .maybeSingle();

    if (assignmentError || !assignment) {
      // Assignment not found — deny rather than leak existence
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const isTrainee = assignment.user_id === user.id;

    if (!isTrainee) {
      // Check for Admin or Senior management role
      let isPrivileged = false;
      for (const roleName of ["Admin", "Senior management"]) {
        const { data: roleResult } = await supabase.rpc("has_role", {
          uid: user.id,
          role_name: roleName,
        });
        if (roleResult) {
          isPrivileged = true;
          break;
        }
      }

      if (!isPrivileged) {
        // Check if the caller is a trainer or assessor assigned to the same course
        const trainerRoles = ['trainer', 'assessor', 'onsite_trainer', 'onsite_assessor'];
        const { data: trainerAssignment } = await adminClient
          .from("course_assignments")
          .select("id")
          .eq("course_id", assignment.course_id)
          .eq("user_id", user.id)
          .in("role", trainerRoles)
          .maybeSingle();

        if (!trainerAssignment) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      }
    }
    // --- End entitlement check ---

    // Generate a signed URL for the file
    const { data, error } = await adminClient.storage
      .from('course-files')
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (error || !data) {
      console.error('Error creating signed URL:', error);
      return NextResponse.json({ 
        error: 'Failed to access file' 
      }, { status: 500 });
    }

    // Redirect to the signed URL
    return NextResponse.redirect(data.signedUrl);
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to download file' 
    }, { status: 500 });
  }
}
