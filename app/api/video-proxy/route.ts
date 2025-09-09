// @ts-nocheck

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { url, userAgent } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // For SharePoint embed URLs, we can't actually proxy the content due to CORS and authentication
    // Instead, provide guidance on authentication
    const urlObj = new URL(url);
    
    if (urlObj.hostname.includes('.sharepoint.com')) {
      return NextResponse.json({
        success: false,
        error: 'SharePoint authentication required',
        suggestion: 'Use popup authentication or open in new window',
        authUrl: url,
        isSharePoint: true
      }, { status: 200 });
    }

    // For other URLs, attempt basic fetch
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgent || 'Mozilla/5.0 (compatible; VideoProxy/1.0)',
        },
        redirect: 'manual'
      });

      if (response.status === 302 || response.status === 301) {
        const location = response.headers.get('location');
        return NextResponse.json({
          success: false,
          error: 'Redirect detected',
          redirectUrl: location
        });
      }

      if (!response.ok) {
        return NextResponse.json({
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`
        });
      }

      return NextResponse.json({
        success: true,
        proxyUrl: url,
        status: response.status
      });

    } catch (fetchError) {
      return NextResponse.json({
        success: false,
        error: `Network error: ${fetchError.message}`
      });
    }

  } catch (error) {
    console.error('Video proxy error:', error);
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 });
  }
}
