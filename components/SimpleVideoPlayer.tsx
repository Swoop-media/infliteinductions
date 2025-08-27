
"use client";

import { useState, useEffect } from 'react';

interface SimpleVideoPlayerProps {
  url: string;
  courseId: string;
}

function normalizeVideoUrl(url: string): { type: 'youtube' | 'vimeo' | 'sharepoint' | 'other', embedUrl: string } {
  try {
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

    // SharePoint
    if (hostname.includes('.sharepoint.com')) {
      return { type: 'sharepoint', embedUrl: url };
    }

    // Other embedded videos (assume they're already embed URLs)
    return { type: 'other', embedUrl: url };
  } catch {
    return { type: 'other', embedUrl: url };
  }
}

export default function SimpleVideoPlayer({ url, courseId }: SimpleVideoPlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { type, embedUrl } = normalizeVideoUrl(url);

  useEffect(() => {
    // Simple loading timeout
    const timer = setTimeout(() => setIsLoading(false), 2000);
    return () => clearTimeout(timer);
  }, [url]);

  const handleIframeLoad = () => {
    setIsLoading(false);
    setError(null);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setError('Failed to load video. Please check the URL or try refreshing the page.');
  };

  if (error) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-md border flex items-center justify-center bg-gray-50">
        <div className="text-center p-6">
          <div className="mb-2">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-gray-600 mb-3">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setIsLoading(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-md border relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-600">Loading video...</p>
          </div>
        </div>
      )}

      <iframe
        src={type === 'sharepoint' ? `/api/video-proxy?url=${encodeURIComponent(embedUrl)}&courseId=${courseId}` : embedUrl}
        className="h-full w-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        title="Course video"
      />
    </div>
  );
}
