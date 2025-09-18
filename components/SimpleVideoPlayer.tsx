// @ts-nocheck

"use client";

import { useState, useEffect } from 'react';

interface SimpleVideoPlayerProps {
  url: string;
  courseId?: string;
  title?: string;
}

export default function SimpleVideoPlayer({ url, courseId, title }: SimpleVideoPlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [embedUrl, setEmbedUrl] = useState('');
  
  useEffect(() => {
    let finalUrl = url;
    
    // Handle iframe embed code - extract src
    if (url.includes('<iframe')) {
      const srcMatch = url.match(/src=["']([^"']+)["']/);
      if (srcMatch) {
        finalUrl = srcMatch[1];
      }
    }
    
    try {
      const parsedUrl = new URL(finalUrl);
      const hostname = parsedUrl.hostname.replace(/^www\./, '');
      
      // YouTube
      if (hostname === 'youtube.com' || hostname === 'm.youtube.com') {
        if (parsedUrl.pathname === '/watch') {
          const videoId = parsedUrl.searchParams.get('v');
          if (videoId) {
            finalUrl = `https://www.youtube.com/embed/${videoId}`;
          }
        } else if (parsedUrl.pathname.startsWith('/shorts/')) {
          const videoId = parsedUrl.pathname.split('/')[2];
          if (videoId) {
            finalUrl = `https://www.youtube.com/embed/${videoId}`;
          }
        }
      } else if (hostname === 'youtu.be') {
        const videoId = parsedUrl.pathname.slice(1).split('/')[0];
        if (videoId) {
          finalUrl = `https://www.youtube.com/embed/${videoId}`;
        }
      }
      
      // Vimeo
      else if (hostname === 'vimeo.com') {
        const videoId = parsedUrl.pathname.split('/').filter(Boolean)[0];
        if (videoId) {
          finalUrl = `https://player.vimeo.com/video/${videoId}`;
        }
      }
      
      // SharePoint - use directly as provided
      // The user's Microsoft authentication should work
    } catch {
      // If URL parsing fails, use as-is
    }
    
    setEmbedUrl(finalUrl);
    setIsLoading(true);
    
    // Set a timeout to hide loading state
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 3000);
    
    return () => clearTimeout(timer);
  }, [url]);
  
  const handleIframeLoad = () => {
    setIsLoading(false);
  };
  
  const openInNewTab = () => {
    window.open(embedUrl, '_blank', 'noopener,noreferrer');
  };
  
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
      
      {/* Open in new tab button */}
      <div className="absolute top-2 right-2 z-20">
        <button
          onClick={openInNewTab}
          className="bg-black bg-opacity-50 hover:bg-opacity-75 text-white px-2 py-1 rounded text-xs transition-all"
          title="Open in new tab"
        >
          ↗
        </button>
      </div>
      
      <iframe
        src={embedUrl}
        className="h-full w-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        onLoad={handleIframeLoad}
        title={title || "Course video"}
      />
    </div>
  );
}