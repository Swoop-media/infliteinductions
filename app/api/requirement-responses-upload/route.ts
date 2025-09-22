// @ts-nocheck

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from "@/lib/supabase/server";

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
    
    // Get trainee info for learner_documents table
    const { data: assignmentData, error: assignmentError } = await supabase
      .from("course_assignments")
      .select("user_id, course_id, role, courses(title)")
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
    const { data: moduleData } = await supabase
      .from("course_modules")
      .select("title")
      .eq("id", moduleId)
      .single();
    
    const moduleTitle = moduleData?.title || "Unknown Module";
    
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
          
          const { error: uploadError } = await supabase.storage
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
              created_at: new Date().toISOString()
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
    await supabase
      .from("requirement_responses")
      .delete()
      .eq("module_id", moduleId)
      .eq("assignment_id", assignmentId)
      .eq("trainer_id", user.id);

    // Insert new responses
    if (responseEntries.length > 0) {
      const { error } = await supabase
        .from("requirement_responses")
        .insert(responseEntries);
      
      if (error) {
        console.error("Error saving requirement responses:", error);
        return NextResponse.json({ 
          error: 'Failed to save responses' 
        }, { status: 500 });
      }
    }
    
    // Insert learner documents using RPC function (same as digital module uploads)
    if (learnerDocumentEntries.length > 0) {
      console.log('Attempting to insert learner documents:', learnerDocumentEntries);
      
      // Use the RPC function for each document entry
      for (const docEntry of learnerDocumentEntries) {
        try {
          // Get course_id and module_id from the assignment
          const { data: moduleInfo } = await supabase
            .from("course_modules")
            .select("course_id")
            .eq("id", moduleId)
            .single();
          
          const { data: documentId, error: rpcError } = await supabase
            .rpc('upsert_learner_document', {
              p_user_id: docEntry.user_id,
              p_course_id: moduleInfo?.course_id || assignmentData?.course_id,
              p_module_id: moduleId,
              p_block_id: null,  // No block for onsite requirements
              p_title: docEntry.title,
              p_file_path: docEntry.file_path,
              p_file_size: docEntry.file_size,
              p_file_type: docEntry.file_type,
              p_expires_on: null,  // No expiry for onsite requirements
              p_assignment_id: assignmentId
            });
          
          if (rpcError) {
            console.error("Error saving learner document via RPC:", rpcError);
            console.error("Error details:", JSON.stringify(rpcError, null, 2));
          } else {
            console.log('Successfully inserted learner document via RPC, ID:', documentId);
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