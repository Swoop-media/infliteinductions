// @ts-nocheck

import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/supabase/auth/roles";
import { redirect } from "next/navigation";
import { DiagnosticTool } from "./DiagnosticTool";

async function loadAllDocuments() {
  "use server";
  const supabase = await createSupabaseServer();
  
  // Get ALL documents with extensive details
  const { data: documents, error } = await supabase
    .from("learner_documents")
    .select(`
      *,
      profiles:user_id (
        id,
        full_name,
        email
      ),
      courses:course_id (
        id,
        title
      ),
      course_modules:module_id (
        id,
        title
      ),
      course_assignments:assignment_id (
        id,
        user_id,
        course_id,
        status
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading documents:", error);
    return { documents: [], error: error.message };
  }

  return { documents: documents || [], error: null };
}

async function loadOrphanedDocuments() {
  "use server";
  const supabase = await createSupabaseServer();
  
  // Find documents with missing relationships
  const { data: orphaned, error } = await supabase
    .rpc("find_orphaned_documents");

  if (error) {
    // RPC might not exist yet, try manual query
    const { data: allDocs } = await supabase
      .from("learner_documents")
      .select("*, profiles:user_id(id)");
    
    const orphanedDocs = allDocs?.filter(doc => !doc.profiles) || [];
    return { orphaned: orphanedDocs, error: null };
  }

  return { orphaned: orphaned || [], error: null };
}

async function loadDocumentLocations() {
  "use server";
  const supabase = await createSupabaseServer();
  
  // Check where documents should appear
  const locations = {
    myProfileDocs: [],
    adminDueDates: [],
    authorizationReviews: []
  };

  // Documents visible in MyProfile (all user documents)
  const { data: userDocs } = await supabase
    .from("learner_documents")
    .select(`
      id,
      title,
      user_id,
      expires_on,
      profiles:user_id (full_name, email)
    `)
    .not("user_id", "is", null);
  
  locations.myProfileDocs = userDocs || [];

  // Documents with expiry dates (for admin due dates)
  const { data: expiryDocs } = await supabase
    .from("learner_documents")
    .select(`
      id,
      title,
      expires_on,
      profiles:user_id (full_name, email)
    `)
    .not("expires_on", "is", null)
    .order("expires_on", { ascending: true });
  
  locations.adminDueDates = expiryDocs || [];

  // Documents linked to authorization assignments
  const { data: authDocs } = await supabase
    .from("learner_documents")
    .select(`
      id,
      title,
      assignment_id,
      course_assignments!inner (
        id,
        user_id,
        course_id,
        status,
        authorisation_assignments!inner (
          id,
          authorisation_id,
          status
        )
      )
    `)
    .not("assignment_id", "is", null);
  
  locations.authorizationReviews = authDocs || [];

  return locations;
}

async function checkDocumentIssues() {
  "use server";
  const supabase = await createSupabaseServer();
  
  const issues = [];

  // Issue 1: Documents without user profiles
  const { data: noProfile } = await supabase
    .from("learner_documents")
    .select(`
      id,
      title,
      user_id
    `)
    .is("user_id", null);
  
  if (noProfile && noProfile.length > 0) {
    issues.push({
      type: "missing_user",
      severity: "high",
      count: noProfile.length,
      message: `${noProfile.length} documents have no user assigned`,
      documents: noProfile
    });
  }

  // Issue 2: Documents with invalid assignment_id
  const { data: invalidAssignment } = await supabase
    .from("learner_documents")
    .select(`
      id,
      title,
      assignment_id
    `)
    .not("assignment_id", "is", null);
  
  const assignmentIds = invalidAssignment?.map(d => d.assignment_id).filter(Boolean) || [];
  
  if (assignmentIds.length > 0) {
    const { data: validAssignments } = await supabase
      .from("course_assignments")
      .select("id")
      .in("id", assignmentIds);
    
    const validIds = new Set(validAssignments?.map(a => a.id) || []);
    const invalidDocs = invalidAssignment?.filter(d => !validIds.has(d.assignment_id)) || [];
    
    if (invalidDocs.length > 0) {
      issues.push({
        type: "invalid_assignment",
        severity: "medium",
        count: invalidDocs.length,
        message: `${invalidDocs.length} documents have invalid assignment references`,
        documents: invalidDocs
      });
    }
  }

  // Issue 3: Documents without course/module links
  const { data: noCourse } = await supabase
    .from("learner_documents")
    .select(`
      id,
      title,
      course_id,
      module_id
    `)
    .is("course_id", null)
    .is("module_id", null);
  
  if (noCourse && noCourse.length > 0) {
    issues.push({
      type: "missing_course",
      severity: "low",
      count: noCourse.length,
      message: `${noCourse.length} documents have no course or module assigned`,
      documents: noCourse
    });
  }

  // Issue 4: Expired documents
  const { data: expired } = await supabase
    .from("learner_documents")
    .select(`
      id,
      title,
      expires_on,
      profiles:user_id (full_name, email)
    `)
    .lt("expires_on", new Date().toISOString())
    .not("expires_on", "is", null);
  
  if (expired && expired.length > 0) {
    issues.push({
      type: "expired",
      severity: "info",
      count: expired.length,
      message: `${expired.length} documents have expired`,
      documents: expired
    });
  }

  return issues;
}

async function fixDocumentIssue(issueType: string, documentId: string, fixData: any) {
  "use server";
  const supabase = await createSupabaseServer();
  
  switch (issueType) {
    case "missing_user":
      // Assign document to a user
      const { error: userError } = await supabase
        .from("learner_documents")
        .update({ user_id: fixData.userId })
        .eq("id", documentId);
      
      return { success: !userError, error: userError?.message };

    case "invalid_assignment":
      // Clear invalid assignment
      const { error: assignError } = await supabase
        .from("learner_documents")
        .update({ assignment_id: null })
        .eq("id", documentId);
      
      return { success: !assignError, error: assignError?.message };

    case "missing_course":
      // Add course/module reference
      const { error: courseError } = await supabase
        .from("learner_documents")
        .update({ 
          course_id: fixData.courseId,
          module_id: fixData.moduleId 
        })
        .eq("id", documentId);
      
      return { success: !courseError, error: courseError?.message };

    default:
      return { success: false, error: "Unknown issue type" };
  }
}

async function linkDocumentToAssignment(documentId: string, assignmentId: string) {
  "use server";
  const supabase = await createSupabaseServer();
  
  // First verify the assignment exists
  const { data: assignment, error: checkError } = await supabase
    .from("course_assignments")
    .select("id, user_id, course_id")
    .eq("id", assignmentId)
    .single();
  
  if (checkError || !assignment) {
    return { success: false, error: "Assignment not found" };
  }

  // Update document with assignment link
  const { error: updateError } = await supabase
    .from("learner_documents")
    .update({ 
      assignment_id: assignmentId,
      user_id: assignment.user_id,
      course_id: assignment.course_id
    })
    .eq("id", documentId);
  
  return { success: !updateError, error: updateError?.message };
}

export default async function DocumentDiagnosticPage() {
  const allowed = (await hasRole("Admin")) || (await hasRole("Trainers and Assessors"));
  if (!allowed) redirect("/app/home?banner=no_access");

  const { documents, error: docsError } = await loadAllDocuments();
  const { orphaned, error: orphanError } = await loadOrphanedDocuments();
  const locations = await loadDocumentLocations();
  const issues = await checkDocumentIssues();

  return (
    <DiagnosticTool 
      documents={documents}
      orphaned={orphaned}
      locations={locations}
      issues={issues}
      fixDocumentIssue={fixDocumentIssue}
      linkDocumentToAssignment={linkDocumentToAssignment}
    />
  );
}