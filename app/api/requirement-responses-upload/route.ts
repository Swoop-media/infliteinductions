// @ts-nocheck

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // Check authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const moduleId = formData.get('moduleId') as string;
    const assignmentId = formData.get('assignmentId') as string;
    const responsesJson = formData.get('responses') as string;
    
    if (!moduleId || !assignmentId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Parse regular responses
    const regularResponses = responsesJson ? JSON.parse(responsesJson) : {};
    
    // Process file uploads
    const fileResponses: Record<string, string> = {};
    
    // Get trainee info for learner_documents table
    const { data: assignmentData } = await supabase
      .from("course_assignments")
      .select("user_id, course_id, courses(title)")
      .eq("id", assignmentId)
      .single();
    
    const traineeUserId = assignmentData?.user_id;
    const courseTitle = assignmentData?.courses?.title || "Unknown Course";
    
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
            learnerDocumentEntries.push({
              user_id: traineeUserId,
              title: file.name,
              file_path: filePath,
              course_title: courseTitle,
              module_title: moduleTitle,
              created_at: new Date().toISOString()
            });
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
    
    // Also prepare learner documents entries for file uploads
    const learnerDocumentEntries = [];

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
    
    // Insert learner documents for file uploads
    if (learnerDocumentEntries.length > 0) {
      const { error: docError } = await supabase
        .from("learner_documents")
        .insert(learnerDocumentEntries);
      
      if (docError) {
        console.error("Error saving learner documents:", docError);
        // Don't fail the entire request if document saving fails
        // The files are still uploaded and responses are saved
      }
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