import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const { email, password, userType } = await request.json();
    
    const supabase = await createSupabaseServer(true); // Admin client
    
    // Create user and auto-confirm them
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm the email
      user_metadata: {
        full_name: email.split('@')[0],
        user_type: userType || 'external_contractor'
      }
    });
    
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }
    
    // Create profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authUser.user.id,
        email: authUser.user.email,
        full_name: email.split('@')[0],
        user_type: userType || 'external_contractor',
        microsoft_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    
    if (profileError) {
      console.error('Profile creation error:', profileError);
    }
    
    // Assign role based on user type
    const roleName = userType === 'external_contractor' 
      ? 'Trainers and Assessors' 
      : 'User';
    
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: authUser.user.id,
        role_name: roleName,
        created_at: new Date().toISOString()
      });
    
    if (roleError) {
      console.error('Role assignment error:', roleError);
    }
    
    return NextResponse.json({ 
      message: 'Test user created successfully',
      email: authUser.user.email,
      confirmed: true
    });
  } catch (error) {
    console.error('Error creating test user:', error);
    return NextResponse.json({ error: 'Failed to create test user' }, { status: 500 });
  }
}