// @ts-nocheck
import { NextResponse } from 'next/server';
import { createSupabaseRoute } from '@/lib/supabase/server';
import { getUncachableResendClient } from '@/lib/resend-client';

function generateTempPassword(): string {
  // Generate a secure temporary password
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}

/**
 * Fully remove a just-created (or orphaned) auth account so the email can be
 * reused immediately.
 *
 * IMPORTANT: auth.admin.deleteUser() alone FAILS with "Database error deleting
 * user" whenever a user_roles row exists (a signup DB trigger creates one, and
 * its FK to auth.users has no ON DELETE CASCADE). So we must delete the
 * dependent public-schema rows first, then delete the auth account.
 */
async function cleanupUser(supabase, userId: string): Promise<{ ok: boolean; detail?: string }> {
  const dependents: Array<[string, string]> = [
    ['course_assignments', 'user_id'],
    ['course_enrolments', 'user_id'],
    ['authorisation_assignments', 'user_id'],
    ['user_roles', 'user_id'],
    ['user_roles', 'granted_by'],
    ['profiles', 'id'],
  ];

  for (const [table, column] of dependents) {
    const { error } = await supabase.from(table).delete().eq(column, userId);
    if (error) {
      console.error(`Cleanup: failed to delete from ${table} (${column}=${userId}):`, error);
    }
  }

  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error(`Cleanup: failed to delete auth user ${userId}:`, deleteError);
    return { ok: false, detail: deleteError.message };
  }
  return { ok: true };
}

/** Find an auth user by email via the admin list API (no direct lookup exists). */
async function findAuthUserByEmail(supabase, email: string) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) return null;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
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

    const createAuthUser = () => supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm the email
      user_metadata: {
        full_name: fullName,
        user_type: userType
      }
    });

    // Create user in Supabase Auth (auto-confirmed)
    let { data: authUser, error: authError } = await createAuthUser();

    // If the email is "already registered", it may be an orphaned auth account
    // left behind by a previously failed creation attempt. An account without a
    // profiles row is such an orphan (every healthy account has one, created by
    // the signup trigger). Clean it up automatically and retry, so the admin
    // never has to delete it manually.
    if (authError && (authError.message?.includes('already been registered') || authError.code === 'email_exists')) {
      const existing = await findAuthUserByEmail(supabase, email);
      if (existing) {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', existing.id)
          .maybeSingle();

        if (!existingProfile) {
          console.warn(`Found orphaned auth account for ${email} (${existing.id}) — cleaning up and retrying creation`);
          const cleanup = await cleanupUser(supabase, existing.id);
          if (!cleanup.ok) {
            return NextResponse.json({
              error: `An earlier attempt to create this user failed and left a broken account that could not be removed automatically (${cleanup.detail}). Please contact support to remove it.`
            }, { status: 500 });
          }
          ({ data: authUser, error: authError } = await createAuthUser());
        } else {
          return NextResponse.json({
            error: 'A user with this email address already exists. If you want to resend their credentials, use the "Resend Credentials" option on their user page instead.'
          }, { status: 409 });
        }
      }
    }

    if (authError) {
      console.error('Auth user creation error:', authError);
      return NextResponse.json({ 
        error: authError.message 
      }, { status: 400 });
    }

    const newUserId = authUser.user.id;

    // Everything after this point must clean up the just-created auth account
    // on failure, otherwise a retry hits "already been registered".
    try {
      // Create profile. A DB trigger may already have created a minimal profile
      // row for the new auth user, so upsert on id instead of inserting.
      // NOTE: profiles has no user_type column — the type lives in auth user_metadata.
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: newUserId,
          email: authUser.user.email,
          full_name: fullName,
          department: department,
          job_description: jobDescription,
          microsoft_id: null,
          created_via_admin: true,
          awaiting_first_login: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      
      if (profileError) {
        console.error('Profile creation error:', profileError);
        throw new Error(`Failed to create user profile: ${profileError.message}`);
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
        // A DB trigger may already grant a default role on signup, so ignore
        // duplicate key conflicts instead of logging an error.
        const { error: roleError } = await supabase
          .from('user_roles')
          .upsert({
            user_id: newUserId,
            role_id: roleRow.id,
            granted_by: actingUser?.id || newUserId,
            granted_at: new Date().toISOString()
          }, { onConflict: 'user_id,role_id', ignoreDuplicates: true });

        if (roleError) {
          console.error('Role assignment error:', roleError);
        }
      } else {
        console.error(`Role assignment error: role "${roleName}" not found`);
      }
      
      // Assign courses if provided
      if (courseIds && courseIds.length > 0) {
        const courseAssignments = courseIds.map((courseId: string) => ({
          user_id: newUserId,
          course_id: courseId,
          created_by: actingUser?.id || newUserId,
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
            user_id: newUserId,
            course_id: courseId,
            status: 'approved'
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
          user_id: newUserId,
          authorisation_id: authId,
          created_by: actingUser?.id || newUserId,
          role: 'trainee',
          assignment_status: 'assigned'
        }));
        
        const { error: assignError } = await supabase
          .from('authorisation_assignments')
          .insert(authAssignments);
        
        if (assignError) {
          console.error('Authorization assignment error:', assignError);
        }
      }

      // NOTE: SafeFLITE sync is intentionally skipped for external users — the
      // sync endpoint requires a microsoft_id (or oid/tid), which external
      // email/password users never have, so it always failed with a 400.
    } catch (stepError) {
      console.error('External user creation failed after auth account was created — cleaning up:', stepError);
      const cleanup = await cleanupUser(supabase, newUserId);
      const retryNote = cleanup.ok
        ? 'The partially-created account was removed — you can retry now.'
        : `WARNING: the partially-created account could not be removed automatically (${cleanup.detail}).`;
      return NextResponse.json({ 
        error: `${stepError.message} ${retryNote}` 
      }, { status: 500 });
    }
    
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
      // The account is fully set up — surface the email failure instead of
      // claiming success, and point the admin at the resend option.
      return NextResponse.json({ 
        message: 'User created, but the credentials email failed to send',
        warning: 'The credentials email could not be sent. Use "Resend Credentials" on the user\'s page to try again.',
        email: authUser.user.email,
        tempPasswordSent: false,
        userId: newUserId
      });
    }
    
    return NextResponse.json({ 
      message: 'External user created successfully',
      email: authUser.user.email,
      tempPasswordSent: true,
      userId: newUserId
    });
    
  } catch (error) {
    console.error('Error creating external user:', error);
    return NextResponse.json({ 
      error: error?.message ? `Failed to create external user: ${error.message}` : 'Failed to create external user'
    }, { status: 500 });
  }
}
