import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRoute } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const { email, password, fullName, department, jobDescription } = await request.json();

    // Validate required fields
    if (!email || !password || !fullName) {
      return NextResponse.json(
        { error: 'Email, password, and full name are required' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    // Use admin client to create the user
    const supabase = supabaseAdmin();

    // Create user in Supabase Auth
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for self-signup
      user_metadata: {
        full_name: fullName,
        department: department || null,
        job_description: jobDescription || null,
        signup_method: 'self_signup'
      }
    });

    if (authError) {
      console.error('Auth user creation error:', authError);
      // Handle duplicate email
      if (authError.message?.includes('already been registered') || authError.message?.includes('email_exists')) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Please sign in instead.' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: authError.message || 'Failed to create account' },
        { status: 400 }
      );
    }

    if (!authUser.user) {
      return NextResponse.json(
        { error: 'Failed to create user account' },
        { status: 500 }
      );
    }

    // Create profile - build the profile object dynamically
    const profileData: any = {
      id: authUser.user.id,
      email: authUser.user.email,
      full_name: fullName,
      microsoft_id: null,
      department: department || null,
      job_description: jobDescription || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Try to insert with user_type first (for databases that have this column)
    let profileError;
    try {
      const { error } = await supabase
        .from('profiles')
        .insert({
          ...profileData,
          user_type: 'external_user'
        });
      profileError = error;
    } catch (e) {
      // If that fails, try without user_type (for databases without this column)
      const { error } = await supabase
        .from('profiles')
        .insert(profileData);
      profileError = error;
    }

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Try to delete the auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json(
        { error: 'Failed to create user profile. Please try again.' },
        { status: 500 }
      );
    }

    // Assign default role (User)
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: authUser.user.id,
        role_name: 'User',
        created_at: new Date().toISOString()
      } as any);

    if (roleError) {
      console.error('Role assignment error:', roleError);
      // Don't fail the signup if role assignment fails, it can be fixed later by admin
    }

    // Optional: Send welcome email using Resend
    // We could add this later if needed, but for now, the user can just log in

    return NextResponse.json({
      message: 'Account created successfully. You can now sign in.',
      userId: authUser.user.id
    });

  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}