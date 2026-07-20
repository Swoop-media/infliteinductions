// @ts-nocheck

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Require an authenticated session before performing any server-side work
    const supabase = await createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Only SharePoint domains are in scope for this proxy helper
    if (urlObj.hostname.includes('.sharepoint.com')) {
      return NextResponse.json({
        success: false,
        error: 'SharePoint authentication required',
        suggestion: 'Use popup authentication or open in new window',
        authUrl: url,
        isSharePoint: true
      }, { status: 200 });
    }

    // All other destinations are not supported — reject to prevent server-side
    // request forgery against internal or external hosts
    return NextResponse.json({
      success: false,
      error: 'Unsupported URL destination'
    }, { status: 400 });

  } catch (error) {
    console.error('Video proxy error:', error);
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 });
  }
}
