// @ts-nocheck
import { NextResponse } from 'next/server';
import { createSupabaseRoute } from '@/lib/supabase/server';
import { syncUserToSafeflite } from '@/lib/webhooks/safeflite-sync';

export async function POST(request: Request) {
  try {
    const { 
      email, 
      fullName, 
      department = null,
      jobDescription = null,
      courseIds = [],
      authorizationIds = []
    } = await request.json();
    
    if (!email || !fullName) {
      return NextResponse.json({ 
        error: 'Email and full name are required' 
      }, { status: 400 });
    }

    const supabase = await createSupabaseRoute(true);

    // Cookie-bound client to identify the admin performing this action
    const supabaseAuth = await createSupabaseRoute(false);
    const { data: { user: actingUser } } = await supabaseAuth.auth.getUser();

    let userId: string;
    let existingUser = false;

    const { data: existingProfileByEmail } = await supabase
      .from('profiles')
      .select('id, email')
      .ilike('email', email)
      .single();
    
    if (existingProfileByEmail) {
      userId = existingProfileByEmail.id;
      existingUser = true;
      console.log(`User ${email} already has a profile, updating...`);
    } else {
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          account_type: 'internal',
          login_method: 'microsoft_sso'
        }
      });
      
      if (authError) {
        if (authError.message?.includes('already been registered') || authError.message?.includes('email_exists')) {
          console.log(`Auth user ${email} exists but no profile found. Searching auth...`);
          
          let foundUser = null;
          let page = 1;
          const maxPages = 100;
          
          while (!foundUser && page <= maxPages) {
            const listResult = await supabase.auth.admin.listUsers({
              page,
              perPage: 1000
            });
            
            const users = listResult?.data?.users;
            if (!users || users.length === 0) break;
            
            foundUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
            
            if (!foundUser && users.length === 1000) {
              page++;
            } else {
              break;
            }
          }
          
          if (foundUser) {
            userId = foundUser.id;
            existingUser = true;
          } else {
            console.error('User exists in auth but not found in search:', email);
            return NextResponse.json({ 
              error: 'A user with this email already exists but their profile could not be located. They may need to log in first to complete their profile setup.' 
            }, { status: 409 });
          }
        } else {
          console.error('Auth user creation error:', authError);
          return NextResponse.json({ 
            error: authError.message 
          }, { status: 400 });
        }
      } else {
        userId = authUser.user.id;
      }
    }
    
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (profileData) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          department: department,
          job_description: jobDescription,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (updateError) {
        console.error('Profile update error:', updateError);
      }
    } else {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          email: email,
          full_name: fullName,
          department: department,
          job_description: jobDescription,
          microsoft_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (profileError) {
        console.error('Profile creation error:', profileError);
        if (!existingUser) {
          await supabase.auth.admin.deleteUser(userId);
        }
        return NextResponse.json({ 
          error: 'Failed to create user profile' 
        }, { status: 500 });
      }
    }
    
    const { data: existingRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('user_id', userId)
      .limit(1);

    if (!existingRoles || existingRoles.length === 0) {
      const { data: defaultRole } = await supabase
        .from('roles')
        .select('id')
        .eq('name', 'General')
        .maybeSingle();

      if (defaultRole) {
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({
            user_id: userId,
            role_id: defaultRole.id,
            granted_by: actingUser?.id || userId,
            granted_at: new Date().toISOString()
          });

        if (roleError) {
          console.error('Role assignment error:', roleError);
        }
      } else {
        console.error('Role assignment error: default "General" role not found');
      }
    }
    
    if (courseIds && courseIds.length > 0) {
      const { data: existingCourseAssignments } = await supabase
        .from('course_assignments')
        .select('course_id')
        .eq('user_id', userId);
      
      const existingCourseIds = new Set(existingCourseAssignments?.map(a => a.course_id) || []);
      const newCourseIds = courseIds.filter((id: string) => !existingCourseIds.has(id));
      
      if (newCourseIds.length > 0) {
        const courseAssignments = newCourseIds.map((courseId: string) => ({
          user_id: userId,
          course_id: courseId,
          created_by: actingUser?.id || userId,
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
          const enrollments = newCourseIds.map((courseId: string) => ({
            user_id: userId,
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
    }
    
    if (authorizationIds && authorizationIds.length > 0) {
      const { data: existingAuthAssignments } = await supabase
        .from('authorisation_assignments')
        .select('authorisation_id')
        .eq('user_id', userId);
      
      const existingAuthIds = new Set(existingAuthAssignments?.map(a => a.authorisation_id) || []);
      const newAuthIds = authorizationIds.filter((id: string) => !existingAuthIds.has(id));
      
      if (newAuthIds.length > 0) {
        const authAssignments = newAuthIds.map((authId: string) => ({
          user_id: userId,
          authorisation_id: authId,
          created_by: actingUser?.id || userId,
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
    }
    
    // Fetch updated profile for SafeFLITE sync
    const { data: profileForSync } = await supabase
      .from('profiles')
      .select('microsoft_id, email, full_name, job_description, department, created_at, updated_at, archived_at')
      .eq('id', userId)
      .single();

    if (profileForSync) {
      await syncUserToSafeflite({
        microsoft_id: profileForSync.microsoft_id,
        email: profileForSync.email,
        full_name: profileForSync.full_name,
        job_description: profileForSync.job_description,
        department: profileForSync.department,
        created_at: profileForSync.created_at,
        updated_at: profileForSync.updated_at,
        archived_at: profileForSync.archived_at
      });
    }

    return NextResponse.json({ 
      message: existingUser ? 'Internal user updated successfully' : 'Internal user created successfully',
      email: email,
      userId: userId,
      assignedCourses: courseIds.length,
      assignedAuthorizations: authorizationIds.length
    });
    
  } catch (error) {
    console.error('Error creating internal user:', error);
    return NextResponse.json({ 
      error: 'Failed to create internal user' 
    }, { status: 500 });
  }
}
