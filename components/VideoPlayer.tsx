
"use client";

import { useState, useEffect } from 'react';

interface VideoPlayerProps {
  url: string;
  courseId: string;
}

function getVideoProvider(url: string): { provider: 'youtube' | 'vimeo' | 'sharepoint' | 'direct', embedUrl: string } {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^www\./, '');

    // YouTube
    if (hostname.includes('youtube.com') || hostname === 'youtu.be') {
      let videoId = '';
      if (hostname === 'youtu.be') {
        videoId = parsedUrl.pathname.slice(1).split('/')[0];
      } else if (parsedUrl.pathname === '/watch') {
        videoId = parsedUrl.searchParams.get('v') || '';
      } else if (parsedUrl.pathname.startsWith('/shorts/')) {
        videoId = parsedUrl.pathname.split('/')[2];
      }
      if (videoId) {
        return { 
          provider: 'youtube', 
          embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1` 
        };
      }
    }

    // Vimeo
    if (hostname === 'vimeo.com') {
      const videoId = parsedUrl.pathname.split('/').filter(Boolean)[0];
      if (videoId) {
        return { 
          provider: 'vimeo', 
          embedUrl: `https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0` 
        };
      }
    }

    // SharePoint
    if (hostname.includes('.sharepoint.com')) {
      return { provider: 'sharepoint', embedUrl: url };
    }

    // Direct video or other embeddable content
    return { provider: 'direct', embedUrl: url };
  } catch {
    return { provider: 'direct', embedUrl: url };
  }
}

export default function VideoPlayer({ url, courseId }: VideoPlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const { provider, embedUrl } = getVideoProvider(url);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    const timer = setTimeout(() => setIsLoading(false), 3000);
    return () => clearTimeout(timer);
  }, [url, retryCount]);

  const handleLoad = () => {
    setIsLoading(false);
    setError(null);
  };

  const handleError = () => {
    setIsLoading(false);
    if (provider === 'sharepoint') {
      setError('Video requires Microsoft authentication. Please ensure you are signed in to Microsoft 365 in this browser.');
    } else {
      setError('Unable to load video. Please check the video URL.');
    }
  };

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    setError(null);
    setIsLoading(true);
  };

  if (error) {
    return (
      <div className="aspect-video w-full bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center">
        <div className="text-center p-6 max-w-md">
          <div className="mb-4">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-gray-900 mb-2">Video Unavailable</h3>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          {provider === 'sharepoint' && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-xs text-blue-800">
                <strong>Tip:</strong> Open <a href="https://office.com" target="_blank" rel="noopener noreferrer" className="underline">office.com</a> in a new tab, sign in, then return here and click retry.
              </p>
            </div>
          )}
          <button
            onClick={handleRetry}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-video w-full bg-black rounded-lg overflow-hidden relative">
      {isLoading && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600 mx-auto mb-3"></div>
            <p className="text-sm text-gray-600">
              {provider === 'sharepoint' ? 'Loading Microsoft video...' : 'Loading video...'}
            </p>
          </div>
        </div>
      )}
      
      <iframe
        key={`${embedUrl}-${retryCount}`}
        src={embedUrl}
        className="w-full h-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-presentation"
        onLoad={handleLoad}
        onError={handleError}
        title="Course Video"
      />
    </div>
  );
}
