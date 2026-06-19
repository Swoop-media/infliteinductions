// @ts-nocheck
import { NextResponse } from 'next/server';
import { createSupabaseRoute } from '@/lib/supabase/server';
import { getUncachableResendClient } from '@/lib/resend-client';
import { syncUserToSafeflite } from '@/lib/webhooks/safeflite-sync';

function generateTempPassword(): string {
  // Generate a secure temporary password
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}

export async function POST(request: Request) {
  try {
    const { 
      email, 
      fullName, 
      userType, // 'external_contractor' or 'external_operator'
      department = null,
      jobDescription = null,
      courseIds = [],
      authorizationIds = []
    } = await request.json();
    
    // Validate input
    if (!email || !fullName || !userType) {
      return NextResponse.json({ 
        error: 'Email, full name, and user type are required' 
      }, { status: 400 });
    }

    // Check if it's a valid external user type
    if (!['external_contractor', 'external_operator'].includes(userType)) {
      return NextResponse.json({ 
        error: 'Invalid user type. Must be external_contractor or external_operator' 
      }, { status: 400 });
    }
    
    const supabase = await createSupabaseRoute(true); // Admin client

    // Cookie-bound client to identify the admin performing this action
    const supabaseAuth = await createSupabaseRoute(false);
    const { data: { user: actingUser } } = await supabaseAuth.auth.getUser();

    // Generate temporary password
    const tempPassword = generateTempPassword();
    
    // Create user in Supabase Auth (auto-confirmed)
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm the email
      user_metadata: {
        full_name: fullName,
        user_type: userType
      }
    });
    
    if (authError) {
      console.error('Auth user creation error:', authError);
      return NextResponse.json({ 
        error: authError.message 
      }, { status: 400 });
    }
    
    // Create profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authUser.user.id,
        email: authUser.user.email,
        full_name: fullName,
        user_type: userType,
        department: department,
        job_description: jobDescription,
        microsoft_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    
    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Try to delete the auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json({ 
        error: 'Failed to create user profile' 
      }, { status: 500 });
    }
    
    // Assign role based on user type
    const roleName = userType === 'external_contractor' 
      ? 'Trainers and Assessors' 
      : 'General';

    const { data: roleRow } = await supabase
      .from('roles')
      .select('id')
      .eq('name', roleName)
      .maybeSingle();

    if (roleRow) {
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: authUser.user.id,
          role_id: roleRow.id,
          granted_by: actingUser?.id || authUser.user.id,
          granted_at: new Date().toISOString()
        });

      if (roleError) {
        console.error('Role assignment error:', roleError);
      }
    } else {
      console.error(`Role assignment error: role "${roleName}" not found`);
    }
    
    // Assign courses if provided
    if (courseIds && courseIds.length > 0) {
      const courseAssignments = courseIds.map((courseId: string) => ({
        user_id: authUser.user.id,
        course_id: courseId,
        created_by: actingUser?.id || authUser.user.id,
        role: 'trainee',
        assignment_status: 'assigned',
        assigned_at: new Date().toISOString()
      }));
      
      const { error: courseError } = await supabase
        .from('course_assignments')
        .insert(courseAssignments);
      
      if (courseError) {
        console.error('Course assignment error:', courseError);
      } else {
        const enrollments = courseIds.map((courseId: string) => ({
          user_id: authUser.user.id,
          course_id: courseId,
          status: 'enrolled'
        }));
        const { error: enrollError } = await supabase
          .from('course_enrolments')
          .upsert(enrollments, { onConflict: 'user_id,course_id', ignoreDuplicates: false });
        if (enrollError) {
          console.error('Course enrollment error:', enrollError);
        }
      }
    }
    
    // Assign authorizations if provided
    if (authorizationIds && authorizationIds.length > 0) {
      const authAssignments = authorizationIds.map((authId: string) => ({
        user_id: authUser.user.id,
        authorisation_id: authId,
        created_by: actingUser?.id || authUser.user.id,
        role: 'trainee',
        assignment_status: 'assigned'
      }));
      
      const { error: authError } = await supabase
        .from('authorisation_assignments')
        .insert(authAssignments);
      
      if (authError) {
        console.error('Authorization assignment error:', authError);
      }
    }
    
    // Sync user to SafeFLITE
    const now = new Date().toISOString();
    await syncUserToSafeflite({
      microsoft_id: null,
      email: authUser.user.email || email,
      full_name: fullName,
      job_description: jobDescription,
      department: department,
      created_at: now,
      updated_at: now,
      archived_at: null
    });

    // Send email with credentials using Resend
    try {
      const { client, fromEmail } = await getUncachableResendClient();
      
      await client.emails.send({
        from: fromEmail,
        to: email,
        subject: 'Welcome to INFLITE Training - Your Account Details',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">Welcome to INFLITE Training</h2>
            
            <p>Dear ${fullName},</p>
            
            <p>Your account has been created for the INFLITE Induction & Training system. You can now access your training materials and complete your assigned courses.</p>
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #333;">Your Login Credentials</h3>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Temporary Password:</strong> <code style="background-color: #fff; padding: 5px 10px; border-radius: 4px; font-size: 14px;">${tempPassword}</code></p>
            </div>
            
            <p><strong>To access the system:</strong></p>
            <ol>
              <li>Visit the training portal</li>
              <li>Click on "Login with Email (External Users)"</li>
              <li>Enter your email and the temporary password above</li>
              <li>You'll be prompted to change your password on first login</li>
            </ol>
            
            ${courseIds.length > 0 ? `
              <p><strong>You have been assigned ${courseIds.length} course${courseIds.length > 1 ? 's' : ''} to complete.</strong></p>
            ` : ''}
            
            ${authorizationIds.length > 0 ? `
              <p><strong>You have been assigned ${authorizationIds.length} authorization${authorizationIds.length > 1 ? 's' : ''}.</strong></p>
            ` : ''}
            
            <p style="margin-top: 30px;">If you have any questions or issues logging in, please contact your administrator.</p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            
            <p style="color: #666; font-size: 12px;">
              This is an automated message from the INFLITE Training system. Please do not reply to this email.
            </p>
          </div>
        `
      });
      
      console.log(`Welcome email sent to ${email}`);
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      // Don't fail the whole process if email fails
      // The user is already created
    }
    
    return NextResponse.json({ 
      message: 'External user created successfully',
      email: authUser.user.email,
      tempPasswordSent: true,
      userId: authUser.user.id
    });
    
  } catch (error) {
    console.error('Error creating external user:', error);
    return NextResponse.json({ 
      error: 'Failed to create external user' 
    }, { status: 500 });
  }
}