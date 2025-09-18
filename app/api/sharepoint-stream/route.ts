// @ts-nocheck

import { NextRequest, NextResponse } from 'next/server';
import { msalInstance } from '@/lib/auth/microsoft';
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

    // Get the user's email to acquire token on behalf of
    const userEmail = session.user.email;
    
    try {
      // Acquire token for SharePoint resources using application permissions
      const tokenResponse = await msalInstance.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
        skipCache: true,
      });

      if (!tokenResponse || !tokenResponse.accessToken) {
        throw new Error('Failed to acquire access token');
      }

      // Parse the SharePoint URL to extract the file path
      const urlObj = new URL(videoUrl);
      const hostname = urlObj.hostname;
      const siteName = hostname.split('.')[0]; // Extract tenant name
      
      // Extract the file path from the URL
      let filePath = urlObj.pathname;
      
      // Build the Microsoft Graph API URL to get the file
      let graphUrl: string;
      
      if (filePath.includes('/sites/')) {
        // Format: /sites/{site-name}/...
        const pathParts = filePath.split('/sites/')[1];
        const [siteId, ...rest] = pathParts.split('/');
        const itemPath = rest.join('/');
        
        // Use Graph API to get the drive item
        graphUrl = `https://graph.microsoft.com/v1.0/sites/${siteName}.sharepoint.com:/sites/${siteId}:/drive/root:/${itemPath}`;
      } else {
        // Try direct file access
        graphUrl = `https://graph.microsoft.com/v1.0/sites/${siteName}.sharepoint.com/drive/root:${filePath}`;
      }

      // Get file metadata including streaming URL
      const metadataResponse = await fetch(graphUrl, {
        headers: {
          'Authorization': `Bearer ${tokenResponse.accessToken}`,
          'Accept': 'application/json',
        },
      });

      if (!metadataResponse.ok) {
        // If the first attempt fails, try alternate path format
        const alternateGraphUrl = `https://graph.microsoft.com/v1.0/sites/root/drive/items/root:${filePath}`;
        
        const altResponse = await fetch(alternateGraphUrl, {
          headers: {
            'Authorization': `Bearer ${tokenResponse.accessToken}`,
            'Accept': 'application/json',
          },
        });
        
        if (!altResponse.ok) {
          throw new Error(`Failed to get file metadata: ${metadataResponse.status}`);
        }
        
        const altData = await altResponse.json();
        
        // Get the download/streaming URL
        const streamUrl = altData['@microsoft.graph.downloadUrl'] || altData.webUrl;
        
        if (streamUrl) {
          return NextResponse.json({ 
            success: true, 
            streamUrl,
            embedUrl: altData.webUrl,
            originalUrl: videoUrl 
          });
        }
      }

      const data = await metadataResponse.json();
      
      // Get the download/streaming URL from Graph API response
      const streamUrl = data['@microsoft.graph.downloadUrl'] || data.webUrl;
      
      if (!streamUrl) {
        throw new Error('No streaming URL found in response');
      }

      // Return the streaming URL that can be used in an iframe or video tag
      return NextResponse.json({ 
        success: true, 
        streamUrl,
        embedUrl: data.webUrl,
        originalUrl: videoUrl 
      });

    } catch (msalError) {
      console.error('MSAL Error:', msalError);
      
      // Fallback: Return the original URL with embed parameters
      const urlObj = new URL(videoUrl);
      const embedParams = 'embed=1&action=embedview&wdAr=1.7777777777777777';
      const separator = videoUrl.includes('?') ? '&' : '?';
      const fallbackUrl = `${videoUrl}${separator}${embedParams}`;
      
      return NextResponse.json({ 
        success: false, 
        streamUrl: fallbackUrl,
        error: 'Using fallback embed URL',
        originalUrl: videoUrl 
      });
    }

  } catch (error) {
    console.error('SharePoint stream error:', error);
    return NextResponse.json({
      error: 'Failed to get SharePoint stream URL',
      details: error.message
    }, { status: 500 });
  }
}