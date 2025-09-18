// @ts-nocheck

"use client";

import { useState, useEffect } from 'react';

interface SimpleVideoPlayerProps {
  url: string;
  courseId?: string;
  title?: string;
}

function normalizeVideoUrl(url: string): { type: 'youtube' | 'vimeo' | 'sharepoint' | 'direct', embedUrl: string } {
  try {
    // Handle iframe embed code - extract src
    if (url.includes('<iframe')) {
      const srcMatch = url.match(/src=["']([^"']+)["']/);
      if (srcMatch) {
        url = srcMatch[1];
      }
    }

    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^www\./, '');

    // YouTube
    if (hostname === 'youtube.com' || hostname === 'm.youtube.com') {
      if (parsedUrl.pathname === '/watch') {
        const videoId = parsedUrl.searchParams.get('v');
        if (videoId) return { type: 'youtube', embedUrl: `https://www.youtube.com/embed/${videoId}` };
      }
      if (parsedUrl.pathname.startsWith('/shorts/')) {
        const videoId = parsedUrl.pathname.split('/')[2];
        if (videoId) return { type: 'youtube', embedUrl: `https://www.youtube.com/embed/${videoId}` };
      }
    }
    
    if (hostname === 'youtu.be') {
      const videoId = parsedUrl.pathname.slice(1).split('/')[0];
      if (videoId) return { type: 'youtube', embedUrl: `https://www.youtube.com/embed/${videoId}` };
    }

    // Vimeo
    if (hostname === 'vimeo.com') {
      const videoId = parsedUrl.pathname.split('/').filter(Boolean)[0];
      if (videoId) return { type: 'vimeo', embedUrl: `https://player.vimeo.com/video/${videoId}` };
    }

    // SharePoint - handle both direct links and embed URLs
    if (hostname.includes('.sharepoint.com')) {
      // If it's already an embed URL, use it directly
      if (url.includes('_layouts/15/embed.aspx')) {
        return { type: 'sharepoint', embedUrl: url };
      }
      
      // For direct SharePoint file links, try to construct embed URL
      if (url.includes(':v:/') || url.includes('/_layouts/')) {
        return { type: 'sharepoint', embedUrl: url };
      }
      
      // For folder links, use direct URL
      return { type: 'sharepoint', embedUrl: url };
    }

    // Direct video files or other embed URLs
    return { type: 'direct', embedUrl: url };
    
  } catch {
    return { type: 'direct', embedUrl: url };
  }
}

export default function SimpleVideoPlayer({ url, courseId, title }: SimpleVideoPlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [needsAuth, setNeedsAuth] = useState(false);
  
  const { type, embedUrl } = normalizeVideoUrl(url);

  useEffect(() => {
    // Reset states when URL changes
    setIsLoading(true);
    setError(null);
    setNeedsAuth(false);
    
    // For SharePoint videos, check if we need authentication
    if (type === 'sharepoint') {
      // Give it a bit more time to load for SharePoint
      const timer = setTimeout(() => {
        setIsLoading(false);
        // If still loading after timeout, likely needs auth
        setNeedsAuth(true);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      // Regular timeout for other video types
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [url, retryCount, type]);

  const handleIframeLoad = () => {
    setIsLoading(false);
    setError(null);
    setNeedsAuth(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setError('Failed to load video. Please try refreshing or check the video URL.');
  };

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    setError(null);
    setIsLoading(true);
  };

  const openInNewTab = () => {
    window.open(embedUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSignIn = () => {
    // Extract SharePoint domain from the video URL
    try {
      const videoUrl = new URL(embedUrl);
      const sharePointDomain = videoUrl.hostname;
      
      // Open SharePoint authentication in a popup window
      // Use the root domain for authentication, not the specific video URL
      const authUrl = `https://${sharePointDomain}/_layouts/15/SignOut.aspx?wa=wsignin1.0`;
      const authWindow = window.open(authUrl, 'sharepoint_auth', 'width=600,height=700,menubar=no,toolbar=no');
      
      // Monitor when the popup closes
      const checkInterval = setInterval(() => {
        if (authWindow && authWindow.closed) {
          clearInterval(checkInterval);
          
          // After authentication popup closes, retry loading the video
          // The authentication cookies should now be set
          setTimeout(() => {
            setRetryCount(prev => prev + 1);
            setNeedsAuth(false);
            setIsLoading(true);
          }, 500);
        }
      }, 500);
      
      // Timeout after 2 minutes if window still open
      setTimeout(() => {
        clearInterval(checkInterval);
        if (authWindow && !authWindow.closed) {
          authWindow.close();
        }
      }, 120000);
    } catch (err) {
      console.error('Error during SharePoint authentication:', err);
      // Fallback to opening video in new tab
      openInNewTab();
    }
  };

  if (error) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-md border flex items-center justify-center bg-gray-50">
        <div className="text-center p-6 max-w-md">
          <div className="mb-4">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Video Error</h3>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <div className="space-y-2">
            <button
              onClick={handleRetry}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={openInNewTab}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded-md text-sm hover:bg-gray-700 transition-colors"
            >
              Open in New Tab
            </button>
          </div>
          {type === 'sharepoint' && (
            <p className="text-xs text-gray-500 mt-3">
              If this is a SharePoint video, you may need to sign in to Microsoft in the new tab first.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Show sign-in prompt for SharePoint videos that need authentication
  if (type === 'sharepoint' && needsAuth && !isLoading) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-md border flex items-center justify-center bg-gray-50">
        <div className="text-center p-6 max-w-md">
          <div className="mb-4">
            <svg className="mx-auto h-16 w-16 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Sign in to view video</h3>
          <p className="text-sm text-gray-600 mb-4">
            This video requires Microsoft 365 authentication. Click below to sign in, then the video will play here automatically.
          </p>
          <div className="space-y-2">
            <button
              onClick={handleSignIn}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
                <path fill="#f3f3f3" d="M0 0h23v23H0z"/>
                <path fill="#f35325" d="M1 1h10v10H1z"/>
                <path fill="#81bc06" d="M12 1h10v10H12z"/>
                <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                <path fill="#ffba08" d="M12 12h10v10H12z"/>
              </svg>
              Sign in with Microsoft
            </button>
            <button
              onClick={openInNewTab}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50 transition-colors"
            >
              Open in separate window instead
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            A sign-in window will open. Once you've signed in, close it and the video will load here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-md border relative bg-black">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-10">
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
            <p className="text-sm">Loading video...</p>
            {type === 'sharepoint' && (
              <p className="text-xs mt-1 opacity-75">
                Connecting to SharePoint...
              </p>
            )}
          </div>
        </div>
      )}

      {/* Control buttons overlay */}
      <div className="absolute top-2 right-2 z-20 flex gap-2">
        <button
          onClick={openInNewTab}
          className="bg-black bg-opacity-50 hover:bg-opacity-75 text-white px-2 py-1 rounded text-xs transition-all"
          title="Open in new tab"
        >
          ↗
        </button>
        {error && (
          <button
            onClick={handleRetry}
            className="bg-red-600 bg-opacity-80 hover:bg-opacity-100 text-white px-2 py-1 rounded text-xs transition-all"
            title="Retry"
          >
            ↻
          </button>
        )}
      </div>

      <iframe
        key={retryCount}
        src={embedUrl}
        className="h-full w-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        title={title || "Course video"}
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
