// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";
import { sendTeamsDMToAppUser } from "@/lib/teams/send";

// Type definitions
type CourseWithDueDate = {
  user_id: string;
  user_name: string;
  user_email: string;
  course_title: string;
  completed_at: string;
  valid_for_days: number;
  due_date: Date;
  days_until_expiry: number;
  status: string;
};

type AuthorisationWithDueDate = {
  user_id: string;
  user_name: string;
  user_email: string;
  authorisation_title: string;
  completed_at: string;
  valid_for_years: number;
  due_date: Date;
  days_until_expiry: number;
  status: string;
};

type DocumentWithDueDate = {
  user_id: string;
  user_name: string;
  user_email: string;
  document_title: string;
  expires_on: string;
  days_until_expiry: number;
  status: string;
};

// Helper function to calculate days until expiry
function calculateDaysUntilExpiry(dueDate: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// Helper function to determine status
function getStatus(daysUntilExpiry: number): string {
  if (daysUntilExpiry < 0) return "⚠️ Overdue";
  if (daysUntilExpiry === 0) return "🔴 Expires Today";
  if (daysUntilExpiry <= 7) return "🟡 Expires This Week";
  if (daysUntilExpiry <= 30) return "🟠 Expires This Month";
  return "✅ Current";
}

// Fetch course due dates
async function fetchCourseDueDates(supabase: any): Promise<CourseWithDueDate[]> {
  const { data, error } = await supabase
    .from("course_assignments")
    .select(`
      id,
      user_id,
      course_id,
      completed_at,
      profiles!course_assignments_user_id_fkey (
        id,
        full_name,
        email
      ),
      courses (
        id,
        title,
        valid_for_days
      )
    `)
    .eq("assignment_status", "completed")
    .not("completed_at", "is", null)
    .not("courses.valid_for_days", "is", null);

  if (error || !data) return [];

  const coursesWithDates: CourseWithDueDate[] = [];
  
  for (const assignment of data) {
    if (!assignment.courses?.valid_for_days || !assignment.completed_at) continue;
    
    const completedDate = new Date(assignment.completed_at);
    const dueDate = new Date(completedDate);
    dueDate.setDate(dueDate.getDate() + assignment.courses.valid_for_days);
    
    const daysUntilExpiry = calculateDaysUntilExpiry(dueDate);
    
    coursesWithDates.push({
      user_id: assignment.user_id,
      user_name: assignment.profiles?.full_name || assignment.profiles?.email || "Unknown",
      user_email: assignment.profiles?.email || "",
      course_title: assignment.courses.title || "Unknown Course",
      completed_at: assignment.completed_at,
      valid_for_days: assignment.courses.valid_for_days,
      due_date: dueDate,
      days_until_expiry: daysUntilExpiry,
      status: getStatus(daysUntilExpiry)
    });
  }

  // Sort by days until expiry (ascending - most urgent first)
  return coursesWithDates.sort((a, b) => a.days_until_expiry - b.days_until_expiry);
}

// Fetch authorisation due dates
async function fetchAuthorisationDueDates(supabase: any): Promise<AuthorisationWithDueDate[]> {
  const { data, error } = await supabase
    .from("authorisation_assignments")
    .select(`
      id,
      user_id,
      authorisation_id,
      completed_at,
      profiles!authorisation_assignments_user_id_fkey (
        id,
        full_name,
        email
      ),
      authorisations (
        id,
        title,
        valid_for_years
      )
    `)
    .eq("assignment_status", "completed")
    .not("completed_at", "is", null)
    .not("authorisations.valid_for_years", "is", null);

  if (error || !data) return [];

  const authorisationsWithDates: AuthorisationWithDueDate[] = [];
  
  for (const assignment of data) {
    if (!assignment.authorisations?.valid_for_years || !assignment.completed_at) continue;
    
    const completedDate = new Date(assignment.completed_at);
    const dueDate = new Date(completedDate);
    dueDate.setFullYear(dueDate.getFullYear() + assignment.authorisations.valid_for_years);
    
    const daysUntilExpiry = calculateDaysUntilExpiry(dueDate);
    
    authorisationsWithDates.push({
      user_id: assignment.user_id,
      user_name: assignment.profiles?.full_name || assignment.profiles?.email || "Unknown",
      user_email: assignment.profiles?.email || "",
      authorisation_title: assignment.authorisations.title || "Unknown Authorisation",
      completed_at: assignment.completed_at,
      valid_for_years: assignment.authorisations.valid_for_years,
      due_date: dueDate,
      days_until_expiry: daysUntilExpiry,
      status: getStatus(daysUntilExpiry)
    });
  }

  // Sort by days until expiry (ascending - most urgent first)
  return authorisationsWithDates.sort((a, b) => a.days_until_expiry - b.days_until_expiry);
}

// Fetch document due dates
async function fetchDocumentDueDates(supabase: any): Promise<DocumentWithDueDate[]> {
  const { data, error } = await supabase
    .from("learner_documents")
    .select(`
      id,
      user_id,
      title,
      expires_on,
      profiles!learner_documents_user_id_fkey (
        id,
        full_name,
        email
      )
    `)
    .not("expires_on", "is", null);

  if (error || !data) return [];

  const documentsWithDates: DocumentWithDueDate[] = [];
  
  for (const doc of data) {
    if (!doc.expires_on) continue;
    
    const expiryDate = new Date(doc.expires_on);
    const daysUntilExpiry = calculateDaysUntilExpiry(expiryDate);
    
    documentsWithDates.push({
      user_id: doc.user_id,
      user_name: doc.profiles?.full_name || doc.profiles?.email || "Unknown",
      user_email: doc.profiles?.email || "",
      document_title: doc.title || "Unknown Document",
      expires_on: doc.expires_on,
      days_until_expiry: daysUntilExpiry,
      status: getStatus(daysUntilExpiry)
    });
  }

  // Sort by days until expiry (ascending - most urgent first)
  return documentsWithDates.sort((a, b) => a.days_until_expiry - b.days_until_expiry);
}

// Format course summary message
function formatCourseSummary(courses: CourseWithDueDate[], total: number): string {
  const today = new Date().toLocaleDateString('en-NZ', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  let message = `🎓 **Daily Course Due Dates Summary**\n`;
  message += `📅 Date: ${today}\n\n`;
  
  if (courses.length === 0) {
    message += `✅ No courses with upcoming expiry dates.\n`;
    return message;
  }

  message += `📋 **Upcoming Course Expiries** (Top ${courses.length})\n\n`;
  
  for (const course of courses) {
    const daysText = course.days_until_expiry < 0 
      ? `${Math.abs(course.days_until_expiry)} days overdue`
      : course.days_until_expiry === 0 
      ? `Today`
      : `${course.days_until_expiry} days`;
    
    message += `👤 **${course.user_name}**\n`;
    message += `   📚 ${course.course_title}\n`;
    message += `   ${course.status} - ${daysText}\n\n`;
  }
  
  if (total > courses.length) {
    message += `📊 Total records: ${total} (showing top ${courses.length})\n`;
  }
  
  return message;
}

// Format authorisation summary message
function formatAuthorisationSummary(authorisations: AuthorisationWithDueDate[], total: number): string {
  const today = new Date().toLocaleDateString('en-NZ', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  let message = `📜 **Daily Authorisation Due Dates Summary**\n`;
  message += `📅 Date: ${today}\n\n`;
  
  if (authorisations.length === 0) {
    message += `✅ No authorisations with upcoming expiry dates.\n`;
    return message;
  }

  message += `📋 **Upcoming Authorisation Expiries** (Top ${authorisations.length})\n\n`;
  
  for (const auth of authorisations) {
    const daysText = auth.days_until_expiry < 0 
      ? `${Math.abs(auth.days_until_expiry)} days overdue`
      : auth.days_until_expiry === 0 
      ? `Today`
      : `${auth.days_until_expiry} days`;
    
    message += `👤 **${auth.user_name}**\n`;
    message += `   🛡️ ${auth.authorisation_title}\n`;
    message += `   ${auth.status} - ${daysText}\n\n`;
  }
  
  if (total > authorisations.length) {
    message += `📊 Total records: ${total} (showing top ${authorisations.length})\n`;
  }
  
  return message;
}

// Format document summary message
function formatDocumentSummary(documents: DocumentWithDueDate[], total: number): string {
  const today = new Date().toLocaleDateString('en-NZ', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  let message = `📄 **Daily Document Due Dates Summary**\n`;
  message += `📅 Date: ${today}\n\n`;
  
  if (documents.length === 0) {
    message += `✅ No documents with upcoming expiry dates.\n`;
    return message;
  }

  message += `📋 **Expiring Documents** (Top ${documents.length})\n\n`;
  
  for (const doc of documents) {
    const daysText = doc.days_until_expiry < 0 
      ? `${Math.abs(doc.days_until_expiry)} days overdue`
      : doc.days_until_expiry === 0 
      ? `Today`
      : `${doc.days_until_expiry} days`;
    
    message += `👤 **${doc.user_name}**\n`;
    message += `   📄 ${doc.document_title}\n`;
    message += `   ${doc.status} - ${daysText}\n\n`;
  }
  
  if (total > documents.length) {
    message += `📊 Total records: ${total} (showing top ${documents.length})\n`;
  }
  
  return message;
}

export async function POST(req: NextRequest) {
  try {
    // Check authorization - only allow if caller is admin or it's a scheduled task
    const authHeader = req.headers.get("authorization");
    const isScheduledTask = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    
    if (!isScheduledTask) {
      const isAdmin = await hasRole("Admin");
      if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabase = supabaseAdmin();

    // First get the Admin role ID
    const { data: adminRole, error: roleError } = await supabase
      .from("roles")
      .select("id")
      .eq("name", "Admin")
      .single();

    if (roleError || !adminRole) {
      return NextResponse.json({ 
        error: "Admin role not found", 
        details: roleError?.message 
      }, { status: 404 });
    }

    // Get all user IDs who have the Admin role
    const { data: adminUserRoles, error: userRoleError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role_id", adminRole.id);

    if (userRoleError || !adminUserRoles || adminUserRoles.length === 0) {
      return NextResponse.json({ 
        error: "No admin users found", 
        details: userRoleError?.message 
      }, { status: 404 });
    }

    // Get profile information for all admin users
    const adminUserIds = adminUserRoles.map(ur => ur.user_id);
    const { data: adminUsers, error: adminError } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", adminUserIds);

    if (adminError || !adminUsers || adminUsers.length === 0) {
      return NextResponse.json({ 
        error: "No admin users found", 
        details: adminError?.message 
      }, { status: 404 });
    }

    // Fetch all due dates data
    const [allCourses, allAuthorisations, allDocuments] = await Promise.all([
      fetchCourseDueDates(supabase),
      fetchAuthorisationDueDates(supabase),
      fetchDocumentDueDates(supabase)
    ]);

    // Limit to top 25 for each type
    const topCourses = allCourses.slice(0, 25);
    const topAuthorisations = allAuthorisations.slice(0, 25);
    const topDocuments = allDocuments.slice(0, 25);

    // Format messages
    const courseMessage = formatCourseSummary(topCourses, allCourses.length);
    const authorisationMessage = formatAuthorisationSummary(topAuthorisations, allAuthorisations.length);
    const documentMessage = formatDocumentSummary(topDocuments, allDocuments.length);

    // Send notifications to each admin
    const results = [];
    for (const admin of adminUsers) {
      try {
        // Send course summary
        if (allCourses.length > 0) {
          await sendTeamsDMToAppUser(admin.id, courseMessage);
        }
        
        // Send authorisation summary
        if (allAuthorisations.length > 0) {
          await sendTeamsDMToAppUser(admin.id, authorisationMessage);
        }
        
        // Send document summary
        if (allDocuments.length > 0) {
          await sendTeamsDMToAppUser(admin.id, documentMessage);
        }
        
        results.push({
          userId: admin.id,
          userName: admin.full_name || admin.email,
          status: "success",
          coursesSent: allCourses.length > 0,
          authorisationsSent: allAuthorisations.length > 0,
          documentsSent: allDocuments.length > 0
        });
      } catch (error) {
        console.error(`Failed to send notifications to admin ${admin.id}:`, error);
        results.push({
          userId: admin.id,
          userName: admin.full_name || admin.email,
          status: "failed",
          error: error.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        adminsNotified: adminUsers.length,
        coursesFound: allCourses.length,
        authorisationsFound: allAuthorisations.length,
        documentsFound: allDocuments.length,
        coursesShown: topCourses.length,
        authorisationsShown: topAuthorisations.length,
        documentsShown: topDocuments.length
      },
      results
    });

  } catch (error) {
    console.error("Error sending daily admin summaries:", error);
    return NextResponse.json({ 
      error: "Failed to send daily summaries", 
      details: error.message 
    }, { status: 500 });
  }
}

// GET endpoint for health check
export async function GET() {
  return NextResponse.json({ 
    status: "healthy",
    endpoint: "/api/admin/send-daily-summaries",
    description: "Daily admin notification summaries endpoint"
  });
}