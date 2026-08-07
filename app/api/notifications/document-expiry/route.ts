// @ts-nocheck
// API endpoint to check for document expiry and send notifications
// Should be called daily by a cron job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyUser } from "@/lib/notifications/dispatcher";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  
  if (!url || !key) {
    throw new Error("Supabase admin environment variables not set");
  }
  
  return createClient(url, key, {
    auth: { persistSession: false },
    // Hard cap on Supabase HTTP round-trips so connection blips can't hang
    // requests indefinitely and saturate the VM (Aug 2026 outages).
    global: {
      fetch: (input: any, init?: any) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000) }),
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Verify the request is authorized (could be from a cron job with a secret)
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = supabaseAdmin();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate dates for notification thresholds
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const tenDaysFromNow = new Date(today);
    tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);

    // Fetch all documents with expiry dates from learner_documents table
    const { data: documents, error } = await supabase
      .from("learner_documents")
      .select(`
        id,
        title,
        expires_on,
        user_id
      `)
      .not("expires_on", "is", null)
      .or("status.is.null,status.neq.replaced")
      .order("expires_on", { ascending: true });
    
    // Get user profiles separately to avoid relationship conflicts
    const userIds = [...new Set((documents || []).map(d => d.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    if (error) {
      console.error("Error fetching documents:", error);
      return NextResponse.json({ 
        error: "Failed to fetch documents",
        details: error.message 
      }, { status: 500 });
    }

    let notifications30Day = 0;
    let notifications10Day = 0;
    let notificationsDaily = 0;
    let notificationsExpired = 0;

    for (const doc of documents || []) {
      const expiryDate = new Date(doc.expires_on);
      expiryDate.setHours(0, 0, 0, 0);
      
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      // Format expiry date for display
      const formattedExpiryDate = expiryDate.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });

      // Determine which notification to send
      let notificationType = null;
      let eventIdSuffix = "";
      
      if (daysUntilExpiry === 30) {
        notificationType = "document_expiry_30";
        eventIdSuffix = "_30day";
        notifications30Day++;
      } else if (daysUntilExpiry === 10) {
        notificationType = "document_expiry_10";
        eventIdSuffix = "_10day";
        notifications10Day++;
      } else if (daysUntilExpiry <= 10 && daysUntilExpiry > 0) {
        // Daily reminders for documents expiring in 10 days or less
        notificationType = "document_expiry_daily";
        eventIdSuffix = `_daily_${today.toISOString().split('T')[0]}`;
        notificationsDaily++;
      } else if (daysUntilExpiry <= 0) {
        // Document has expired
        notificationType = "document_expiry_daily";
        eventIdSuffix = `_expired_${today.toISOString().split('T')[0]}`;
        notificationsExpired++;
      }

      if (notificationType) {
        const profile = profileMap.get(doc.user_id);
        // Send notification to document owner
        await notifyUser(
          doc.user_id,
          notificationType,
          {
            documentName: doc.title || "Document",
            documentId: doc.id,
            expiryDate: formattedExpiryDate,
            daysUntilExpiry: Math.max(0, daysUntilExpiry),
            learnerName: profile?.full_name,
            learner_email: profile?.email,
            url: `/app/myprofile/documents`
          },
          { 
            eventId: `document_expiry_${doc.id}${eventIdSuffix}`,
            skipTeams: false 
          }
        );
      }
    }

    const summary = {
      totalDocuments: documents?.length || 0,
      notifications30Day,
      notifications10Day,
      notificationsDaily,
      notificationsExpired,
      timestamp: new Date().toISOString()
    };

    console.log("Document expiry notifications sent:", summary);

    return NextResponse.json({ 
      success: true,
      summary
    });
    
  } catch (error: any) {
    console.error("Document expiry notification error:", error);
    return NextResponse.json({ 
      error: "Failed to process document expiry notifications",
      details: error.message 
    }, { status: 500 });
  }
}