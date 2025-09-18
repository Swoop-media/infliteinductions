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
  
  const { type, embedUrl } = normalizeVideoUrl(url);

  useEffect(() => {
    // Reset states when URL changes
    setIsLoading(true);
    setError(null);
    
    // For SharePoint videos, don't show loading since we'll show a prompt
    if (type === 'sharepoint') {
      setIsLoading(false);
      return;
    }
    
    // Set a timeout for loading state for other videos
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 3000);
    
    return () => clearTimeout(timer);
  }, [url, type]);

  const handleIframeLoad = () => {
    setIsLoading(false);
    setError(null);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setError('Failed to load video. Please try refreshing or check the video URL.');
  };

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    // Force reload by updating the timestamp
    const iframe = document.querySelector('iframe');
    if (iframe) {
      iframe.src = iframe.src;
    }
  };

  const openInNewTab = () => {
    window.open(embedUrl, '_blank', 'noopener,noreferrer');
  };

  const openSharePointVideo = () => {
    // Open SharePoint video in a popup window
    const videoWindow = window.open(embedUrl, 'sharepoint_video', 'width=1200,height=700,toolbar=no,menubar=no');
    if (videoWindow) {
      videoWindow.focus();
    }
  };

  // Special handling for SharePoint videos - show a user-friendly prompt
  if (type === 'sharepoint') {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-md border flex items-center justify-center bg-gray-50">
        <div className="text-center p-6 max-w-md">
          <div className="mb-4">
            <svg className="mx-auto h-16 w-16 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">SharePoint Video</h3>
          <p className="text-sm text-gray-600 mb-4">
            This video is hosted on SharePoint. Click below to watch it in a popup window.
          </p>
          <div className="space-y-2">
            <button
              onClick={openSharePointVideo}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
                <path fill="#f3f3f3" d="M0 0h23v23H0z"/>
                <path fill="#f35325" d="M1 1h10v10H1z"/>
                <path fill="#81bc06" d="M12 1h10v10H12z"/>
                <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                <path fill="#ffba08" d="M12 12h10v10H12z"/>
              </svg>
              Watch Video
            </button>
            <button
              onClick={openInNewTab}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50 transition-colors"
            >
              Open in Full Browser Tab
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Sign in with your Microsoft 365 account if prompted. Close the window when done to continue the course.
          </p>
        </div>
      </div>
    );
  }

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
        src={embedUrl}
        className="h-full w-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        title={title || "Course video"}
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}