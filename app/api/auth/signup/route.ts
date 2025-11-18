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

    // Check if a profile already exists with this email
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (existingProfile) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in instead.' },
        { status: 400 }
      );
    }

    // Use signUp method which properly sends confirmation emails
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          department: department || null,
          job_description: jobDescription || null,
          signup_method: 'self_signup'
        }
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

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create user account' },
        { status: 500 }
      );
    }

    // Create profile - only include essential fields that exist in production
    const profileData = {
      id: authData.user.id,
      email: authData.user.email,
      full_name: fullName,
      microsoft_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Add optional fields if they have values
    if (department) {
      (profileData as any).department = department;
    }
    if (jobDescription) {
      (profileData as any).job_description = jobDescription;
    }

    console.log('Creating profile with data:', JSON.stringify(profileData));
    
    const { error: profileError, data: profileData2 } = await supabase
      .from('profiles')
      .insert(profileData as any)
      .select();

    if (profileError) {
      console.error('Profile creation error:', JSON.stringify(profileError));
      console.error('Error details - code:', profileError.code, 'message:', profileError.message);
      
      // Try to delete the auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authData.user.id);
      
      // Provide more specific error message
      let errorMessage = 'Failed to create user profile.';
      if (profileError.message?.includes('duplicate')) {
        errorMessage = 'A profile with this email already exists.';
      } else if (profileError.message?.includes('column')) {
        errorMessage = 'Database configuration issue. Please contact support.';
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }
    
    console.log('Profile created successfully:', profileData2);

    // Assign default role (User)
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: authData.user.id,
        role_name: 'User',
        created_at: new Date().toISOString()
      } as any);

    if (roleError) {
      console.error('Role assignment error:', roleError);
      // Don't fail the signup if role assignment fails, it can be fixed later by admin
    }

    return NextResponse.json({
      message: 'Account created successfully! Please check your email to confirm your account before signing in.',
      userId: authData.user.id,
      requiresEmailConfirmation: true
    });

  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}