// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const supabaseService = supabaseAdmin();
  
  // Get ALL course assignments without any joins
  const { data: allAssignments, error: assignError } = await supabaseService
    .from("course_assignments")
    .select("*")
    .in("course_id", [
      'bdc908f2-0346-4678-9b96-ba76a6dc591b',
      '54e82b81-b2db-49ee-b644-27e6b0ad4451', 
      'c7e65bae-bb3d-49d0-b992-fe4c09b15451'
    ])
    .order('created_at', { ascending: false });

  // Get profiles for Henry and Peter
  const { data: profiles } = await supabaseService
    .from("profiles")
    .select("id, full_name, email")
    .in("email", ['henry.morgan@inflite.nz', 'peter.hansen@inflite.nz']);

  // Group assignments by role
  const assignmentsByRole = {};
  if (allAssignments) {
    for (const a of allAssignments) {
      if (!assignmentsByRole[a.role]) {
        assignmentsByRole[a.role] = [];
      }
      assignmentsByRole[a.role].push({
        user_id: a.user_id,
        course_id: a.course_id,
        created_at: a.created_at
      });
    }
  }

  // Check specific user assignments
  let henryAssignments = [];
  let peterAssignments = [];
  
  if (profiles) {
    const henryId = profiles.find(p => p.email === 'henry.morgan@inflite.nz')?.id;
    const peterId = profiles.find(p => p.email === 'peter.hansen@inflite.nz')?.id;
    
    if (allAssignments) {
      henryAssignments = allAssignments.filter(a => a.user_id === henryId);
      peterAssignments = allAssignments.filter(a => a.user_id === peterId);
    }
  }

  return NextResponse.json({
    totalAssignments: allAssignments?.length || 0,
    assignmentsByRole,
    profiles,
    henryAssignments: {
      count: henryAssignments.length,
      data: henryAssignments
    },
    peterAssignments: {
      count: peterAssignments.length,
      data: peterAssignments
    },
    error: assignError
  });
}