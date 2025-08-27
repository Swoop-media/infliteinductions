
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { url, userAgent } = await req.json();
    
    console.log('[VideoProxy] Request received:', {
      url,
      userAgent,
      timestamp: new Date().toISOString(),
      origin: req.headers.get('origin'),
      referer: req.headers.get('referer')
    });

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Parse the SharePoint URL
    const urlObj = new URL(url);
    const isSharePoint = urlObj.hostname.includes('.sharepoint.com');
    const isMicrosoft = urlObj.hostname.includes('microsoft.com');
    
    console.log('[VideoProxy] URL analysis:', {
      hostname: urlObj.hostname,
      pathname: urlObj.pathname,
      isSharePoint,
      isMicrosoft,
      search: urlObj.search
    });

    // Try to fetch the video with various strategies
    const strategies = [
      { name: 'direct', headers: {} },
      { name: 'with-user-agent', headers: { 'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } },
      { name: 'with-referer', headers: { 'Referer': urlObj.origin } },
      { name: 'with-full-headers', headers: {
        'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': urlObj.origin,
        'Accept': 'video/mp4,video/*,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }}
    ];

    for (const strategy of strategies) {
      try {
        console.log(`[VideoProxy] Trying strategy: ${strategy.name}`);
        
        const response = await fetch(url, {
          method: 'HEAD',
          headers: strategy.headers,
          redirect: 'manual'
        });

        console.log(`[VideoProxy] Strategy ${strategy.name} response:`, {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          redirected: response.redirected,
          type: response.type
        });

        // Check if we're getting redirected to login
        const location = response.headers.get('location');
        if (location && (location.includes('login') || location.includes('signin'))) {
          console.log(`[VideoProxy] Strategy ${strategy.name} redirects to login:`, location);
          continue;
        }

        // Check content type
        const contentType = response.headers.get('content-type');
        console.log(`[VideoProxy] Content-Type: ${contentType}`);

        if (response.ok || response.status === 206) {
          console.log(`[VideoProxy] Strategy ${strategy.name} succeeded`);
          return NextResponse.json({
            success: true,
            strategy: strategy.name,
            proxyUrl: url, // Return original URL since we can't actually proxy due to CORS
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            contentType,
            timestamp: new Date().toISOString()
          });
        }

      } catch (error) {
        console.log(`[VideoProxy] Strategy ${strategy.name} failed:`, error);
        continue;
      }
    }

    // If all strategies failed, return detailed error info
    console.log('[VideoProxy] All strategies failed');
    
    return NextResponse.json({
      success: false,
      error: 'All authentication strategies failed',
      url,
      analysis: {
        hostname: urlObj.hostname,
        isSharePoint,
        isMicrosoft,
        timestamp: new Date().toISOString()
      },
      suggestions: [
        'Video may require SharePoint authentication',
        'Try opening video in new window to authenticate',
        'Check if user has access to the SharePoint site',
        'Verify video URL is publicly accessible'
      ]
    }, { status: 403 });

  } catch (error) {
    console.error('[VideoProxy] Unexpected error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    message: 'Video proxy endpoint - use POST with { url, userAgent }',
    timestamp: new Date().toISOString()
  });
}
