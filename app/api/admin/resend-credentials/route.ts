// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";
import { getUncachableResendClient } from "@/lib/resend-client";

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const isAdmin = await hasRole("Admin");
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 403 });
    }

    const adminClient = supabaseAdmin();

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .single();

    if (profileError) {
      console.error("Profile lookup error:", profileError);
      return NextResponse.json({ error: "User profile not found", details: profileError.message }, { status: 404 });
    }

    if (!profile || !profile.email) {
      return NextResponse.json({ error: "User profile has no email" }, { status: 404 });
    }

    const tempPassword = generateTempPassword();

    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
      password: tempPassword,
    });

    if (updateError) {
      console.error("Password update error:", updateError);
      return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
    }

    try {
      const { client, fromEmail } = await getUncachableResendClient();
      console.log("Resend config - fromEmail:", fromEmail, "toEmail:", profile.email);

      const emailResult = await client.emails.send({
        from: fromEmail,
        to: profile.email,
        subject: 'INFLITE Training - Your Updated Login Credentials',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">INFLITE Training - Login Credentials</h2>
            
            <p>Dear ${profile.full_name || 'User'},</p>
            
            <p>Your login credentials for the INFLITE Training system have been updated by an administrator.</p>
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #333;">Your Login Credentials</h3>
              <p><strong>Email:</strong> ${profile.email}</p>
              <p><strong>Temporary Password:</strong> <code style="background-color: #fff; padding: 5px 10px; border-radius: 4px; font-size: 14px;">${tempPassword}</code></p>
            </div>
            
            <p><strong>To access the system:</strong></p>
            <ol>
              <li>Visit the training portal</li>
              <li>Click on "Login with Email (External Users)"</li>
              <li>Enter your email and the temporary password above</li>
            </ol>
            
            <p style="margin-top: 30px;">If you have any questions or issues logging in, please contact your administrator.</p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            
            <p style="color: #666; font-size: 12px;">
              This is an automated message from the INFLITE Training system. Please do not reply to this email.
            </p>
          </div>
        `
      });

      console.log(`Credentials resent to ${profile.email}`, JSON.stringify(emailResult));

      return NextResponse.json({
        success: true,
        message: `New credentials sent to ${profile.email}`,
        emailId: emailResult?.data?.id,
      });
    } catch (emailError) {
      console.error("Failed to send email:", emailError);
      return NextResponse.json({
        success: true,
        message: `Password reset but email failed to send. Temporary password: ${tempPassword}`,
        tempPassword,
        emailFailed: true,
      });
    }
  } catch (error) {
    console.error("Resend credentials error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
