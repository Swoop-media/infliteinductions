// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

export async function GET(req: NextRequest) {
  try {
    // Check if user is admin
    const isAdmin = await hasRole("Admin");
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 401 });
    }

    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get host from request headers for absolute URL
    const host = req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const baseUrl = `${protocol}://${host}`;

    // Call the main daily summaries endpoint
    const response = await fetch(`${baseUrl}/api/admin/send-daily-summaries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': req.headers.get('cookie') || ''
      }
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json({ 
        error: "Failed to send daily summaries", 
        details: result 
      }, { status: response.status });
    }

    // Return a formatted HTML response for easier testing
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Daily Admin Summaries - Test Result</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            max-width: 1200px;
            margin: 40px auto;
            padding: 20px;
            background: #f3f4f6;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          h1 {
            color: #1f2937;
            margin-bottom: 10px;
          }
          .success {
            color: #10b981;
            font-weight: 600;
          }
          .timestamp {
            color: #6b7280;
            font-size: 14px;
            margin-bottom: 30px;
          }
          .summary {
            background: #f9fafb;
            padding: 20px;
            border-radius: 6px;
            margin-bottom: 30px;
          }
          .summary h2 {
            color: #374151;
            font-size: 18px;
            margin-top: 0;
          }
          .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
          }
          .stat {
            background: white;
            padding: 15px;
            border-radius: 4px;
            border: 1px solid #e5e7eb;
          }
          .stat-label {
            color: #6b7280;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .stat-value {
            color: #1f2937;
            font-size: 24px;
            font-weight: 600;
            margin-top: 5px;
          }
          .results {
            margin-top: 30px;
          }
          .results h2 {
            color: #374151;
            font-size: 18px;
            margin-bottom: 15px;
          }
          .admin-result {
            background: #f9fafb;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 10px;
            border-left: 4px solid #10b981;
          }
          .admin-result.failed {
            border-left-color: #ef4444;
          }
          .admin-name {
            font-weight: 600;
            color: #1f2937;
          }
          .notifications-sent {
            margin-top: 10px;
            font-size: 14px;
            color: #6b7280;
          }
          .notification-type {
            display: inline-block;
            padding: 2px 8px;
            background: #e0f2fe;
            color: #0369a1;
            border-radius: 3px;
            font-size: 12px;
            margin-right: 5px;
          }
          .back-link {
            display: inline-block;
            margin-top: 30px;
            padding: 10px 20px;
            background: #3b82f6;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
          }
          .back-link:hover {
            background: #2563eb;
          }
          .info-box {
            background: #fef3c7;
            border: 1px solid #fbbf24;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
          }
          .info-box h3 {
            color: #92400e;
            margin-top: 0;
            font-size: 14px;
          }
          .info-box p {
            color: #78350f;
            font-size: 13px;
            margin: 5px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎯 Daily Admin Summaries Test</h1>
          <div class="timestamp">Executed at: ${new Date().toLocaleString('en-NZ')}</div>
          
          <div class="info-box">
            <h3>ℹ️ Test Mode Information</h3>
            <p>• This is a manual test of the daily admin notification system</p>
            <p>• Notifications have been sent to all admin users via Teams</p>
            <p>• In production, this will run automatically at 8:00 AM NZ time</p>
          </div>

          ${result.success ? `
            <div class="summary">
              <h2>📊 Summary</h2>
              <div class="stats">
                <div class="stat">
                  <div class="stat-label">Admins Notified</div>
                  <div class="stat-value">${result.summary.adminsNotified}</div>
                </div>
                <div class="stat">
                  <div class="stat-label">Courses Found</div>
                  <div class="stat-value">${result.summary.coursesFound}</div>
                </div>
                <div class="stat">
                  <div class="stat-label">Authorisations Found</div>
                  <div class="stat-value">${result.summary.authorisationsFound}</div>
                </div>
                <div class="stat">
                  <div class="stat-label">Documents Found</div>
                  <div class="stat-value">${result.summary.documentsFound}</div>
                </div>
              </div>
            </div>

            <div class="results">
              <h2>📨 Notification Results</h2>
              ${result.results.map(r => `
                <div class="admin-result ${r.status === 'failed' ? 'failed' : ''}">
                  <div class="admin-name">👤 ${r.userName}</div>
                  <div class="notifications-sent">
                    ${r.status === 'success' ? 
                      `<span class="success">✓ Notifications sent:</span>
                       ${r.coursesSent ? '<span class="notification-type">📚 Courses</span>' : ''}
                       ${r.authorisationsSent ? '<span class="notification-type">🛡️ Authorisations</span>' : ''}
                       ${r.documentsSent ? '<span class="notification-type">📄 Documents</span>' : ''}
                       ${!r.coursesSent && !r.authorisationsSent && !r.documentsSent ? '<em>No expiring items to report</em>' : ''}`
                      : `<span style="color: #ef4444;">✗ Failed: ${r.error || 'Unknown error'}</span>`
                    }
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div style="background: #fee2e2; padding: 20px; border-radius: 6px; border: 1px solid #ef4444;">
              <h2 style="color: #991b1b; margin-top: 0;">❌ Test Failed</h2>
              <p style="color: #7f1d1d;">${result.error || 'Unknown error occurred'}</p>
              ${result.details ? `<pre style="background: white; padding: 10px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(result.details, null, 2)}</pre>` : ''}
            </div>
          `}

          <a href="/app/admin" class="back-link">← Back to Admin Dashboard</a>
        </div>
      </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    });

  } catch (error) {
    console.error("Error in test daily summaries:", error);
    return NextResponse.json({ 
      error: "Failed to test daily summaries", 
      details: error.message 
    }, { status: 500 });
  }
}