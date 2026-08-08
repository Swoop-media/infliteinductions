// @ts-nocheck

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    console.log('=== REQUIREMENT UPLOAD ENDPOINT CALLED ===');
    const supabase = await createSupabaseServer();
    
    // Check authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('Authenticated user (trainer/assessor):', user.id);

    const formData = await request.formData();
    const moduleId = formData.get('moduleId') as string;
    const assignmentId = formData.get('assignmentId') as string;
    const responsesJson = formData.get('responses') as string;
    
    console.log('Request data:', { moduleId, assignmentId, hasResponses: !!responsesJson });
    
    if (!moduleId || !assignmentId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Parse regular responses
    const regularResponses = responsesJson ? JSON.parse(responsesJson) : {};
    
    // Process file uploads
    const fileResponses: Record<string, string> = {};
    const learnerDocumentEntries: any[] = [];
    
    // Use admin client to bypass RLS
    const adminClient = supabaseAdmin();
    
    // Get trainee info for learner_documents table
    const { data: assignmentData, error: assignmentError } = await adminClient
      .from("course_assignments")
      .select("user_id, course_id, role, courses!course_assignments_course_id_fkey(title)")
      .eq("id", assignmentId)
      .single();
    
    console.log('Assignment query result:', { 
      assignmentData, 
      assignmentError,
      assignmentId 
    });
    
    if (assignmentError) {
      console.error('Error fetching assignment:', assignmentError);
    }
    
    const traineeUserId = assignmentData?.user_id;
    const courseTitle = assignmentData?.courses?.title || "Unknown Course";
    
    console.log('Trainee info:', {
      traineeUserId,
      role: assignmentData?.role,
      courseTitle
    });
    
    // Get module info
    const { data: moduleData } = await adminClient
      .from("course_modules")
      .select("title")
      .eq("id", moduleId)
      .single();
    
    const moduleTitle = moduleData?.title || "Unknown Module";
    
    // Store due dates from form
    const dueDates: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('dueDate_')) {
        const requirementId = key.replace('dueDate_', '');
        dueDates[requirementId] = value as string;
      }
    }
    
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('file_')) {
        const requirementId = key.replace('file_', '');
        const file = value as File;
        
        if (file && file.size > 0) {
          // Upload file to storage
          const fileExt = file.name.split('.').pop();
          const fileName = `${crypto.randomUUID()}.${fileExt}`;
          const filePath = `requirement-uploads/${assignmentId}/${requirementId}/${fileName}`;
          
          // Convert File to ArrayBuffer then to Buffer
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          // Use admin client for storage upload as well
          const { error: uploadError } = await adminClient.storage
            .from('course-files')
            .upload(filePath, buffer, {
              contentType: file.type,
            });
          
          if (uploadError) {
            console.error('File upload error:', uploadError);
            return NextResponse.json({ 
              error: `Failed to upload file: ${uploadError.message}` 
            }, { status: 500 });
          }
          
          // Store the file path as the response value
          fileResponses[requirementId] = filePath;
          
          // Prepare entry for learner_documents table
          if (traineeUserId) {
            const docEntry = {
              user_id: traineeUserId,
              title: file.name,
              file_path: filePath,
              file_size: file.size,
              file_type: file.type,
              course_title: courseTitle,
              module_title: moduleTitle,
              created_at: new Date().toISOString(),
              expires_on: dueDates[requirementId] || null  // Use due date if provided, otherwise null
            };
            console.log('Preparing learner document entry:', docEntry);
            learnerDocumentEntries.push(docEntry);
          } else {
            console.error('No traineeUserId found for assignment:', assignmentId);
          }
        }
      }
    }
    
    // Combine regular responses with file paths
    const allResponses = { ...regularResponses, ...fileResponses };
    
    // Save or update requirement responses
    const responseEntries = Object.entries(allResponses).map(([requirementId, value]) => ({
      requirement_id: requirementId,
      module_id: moduleId,
      assignment_id: assignmentId,
      trainer_id: user.id,
      response_value: typeof value === 'string' ? value : JSON.stringify(value),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    // First, delete existing responses for this module/assignment/trainer combination
    await adminClient
      .from("requirement_responses")
      .delete()
      .eq("module_id", moduleId)
      .eq("assignment_id", assignmentId)
      .eq("trainer_id", user.id);

    // Insert new responses
    if (responseEntries.length > 0) {
      const { error } = await adminClient
        .from("requirement_responses")
        .insert(responseEntries);
      
      if (error) {
        console.error("Error saving requirement responses:", error);
        return NextResponse.json({ 
          error: 'Failed to save responses' 
        }, { status: 500 });
      }
    }
    
    // Insert learner documents with retention: mark any existing active
    // document for the same user/module (onsite uploads have no block) as
    // "replaced" — never update-in-place or delete — then insert the new
    // document as the active one. Old records and storage files are kept.
    if (learnerDocumentEntries.length > 0) {
      console.log('Attempting to insert learner documents:', learnerDocumentEntries);

      // Get course_id from the module (shared by all entries)
      const { data: moduleInfo } = await adminClient
        .from("course_modules")
        .select("course_id")
        .eq("id", moduleId)
        .single();
      const courseIdForDocs = moduleInfo?.course_id || assignmentData?.course_id;

      for (const docEntry of learnerDocumentEntries) {
        try {
          // Mark existing active document(s) for this user/module as replaced
          // Two-call replace: pass 1 catches pre-migration NULL-status rows;
          // pass 2 catches rows with a non-'replaced' value. A single .or()
          // filter in PostgREST UPDATE context can silently skip rows.
          await adminClient
            .from("learner_documents")
            .update({ status: 'replaced', updated_at: new Date().toISOString() })
            .eq("user_id", docEntry.user_id)
            .eq("module_id", moduleId)
            .is("block_id", null)
            .is("status", null);
          const { error: replaceError } = await adminClient
            .from("learner_documents")
            .update({ status: 'replaced', updated_at: new Date().toISOString() })
            .eq("user_id", docEntry.user_id)
            .eq("module_id", moduleId)
            .is("block_id", null)
            .neq("status", "replaced");

          if (replaceError) {
            console.error("Error marking previous learner document as replaced:", replaceError);
          }

          const { data: inserted, error: insertError } = await adminClient
            .from("learner_documents")
            .insert({
              user_id: docEntry.user_id,
              course_id: courseIdForDocs,
              module_id: moduleId,
              block_id: null,  // No block for onsite requirements
              title: docEntry.title,
              file_path: docEntry.file_path,
              file_size: docEntry.file_size,
              file_type: docEntry.file_type,
              expires_on: docEntry.expires_on || null,
              assignment_id: assignmentId,
              course_title: docEntry.course_title,
              module_title: docEntry.module_title,
              status: 'active',
              created_at: new Date().toISOString()
            })
            .select("id")
            .single();

          if (insertError) {
            console.error("Error saving learner document:", insertError);
          } else {
            console.log('Successfully inserted learner document, ID:', inserted?.id);
          }
        } catch (err) {
          console.error("Exception while saving learner document:", err);
        }
      }
    } else {
      console.log('No learner document entries to insert');
    }

    return NextResponse.json({ 
      success: true,
      message: 'Responses and files uploaded successfully' 
    });
  } catch (error) {
    console.error('Requirement upload error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to process upload' 
    }, { status: 500 });
  }
}