// @ts-nocheck

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoUrl = searchParams.get('url');
    
    if (!videoUrl) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Get current user session
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Parse SharePoint URL
    const urlObj = new URL(videoUrl);
    
    // Forward the request with authentication headers
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        // Forward cookies for SharePoint authentication
        'Cookie': request.headers.get('Cookie') || '',
        // Add referrer to help with SharePoint authentication
        'Referer': urlObj.origin,
        'Origin': urlObj.origin,
      },
      credentials: 'include',
      redirect: 'follow',
    });

    // If it's a redirect (SharePoint auth), handle it
    if (response.status === 302 || response.status === 301) {
      const location = response.headers.get('location');
      if (location) {
        // Follow the redirect
        const redirectResponse = await fetch(location, {
          headers: {
            'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0',
            'Accept': '*/*',
            'Cookie': request.headers.get('Cookie') || '',
            'Referer': urlObj.origin,
          },
          credentials: 'include',
        });
        
        // Return the final content
        const contentType = redirectResponse.headers.get('content-type') || 'text/html';
        const body = await redirectResponse.arrayBuffer();
        
        return new NextResponse(body, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
          },
        });
      }
    }

    // Get the content type
    const contentType = response.headers.get('content-type') || 'text/html';
    
    // Handle HTML content (SharePoint pages)
    if (contentType.includes('text/html')) {
      let html = await response.text();
      
      // Inject base tag to fix relative URLs
      const baseUrl = urlObj.origin;
      const baseTag = `<base href="${baseUrl}/" target="_self">`;
      html = html.replace('<head>', `<head>${baseTag}`);
      
      // Remove X-Frame-Options restrictions
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
          // Remove restrictive headers
          'X-Frame-Options': 'SAMEORIGIN',
          'Content-Security-Policy': "frame-ancestors 'self' *",
        },
      });
    }
    
    // For video files, stream directly
    const body = await response.arrayBuffer();
    
    return new NextResponse(body, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    console.error('SharePoint proxy error:', error);
    return NextResponse.json({
      error: 'Failed to proxy SharePoint content',
      details: error.message
    }, { status: 500 });
  }
}