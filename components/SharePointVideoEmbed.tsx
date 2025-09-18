// @ts-nocheck
"use client";

import { useState, useEffect, useCallback } from 'react';

interface SharePointVideoEmbedProps {
  url: string;
  courseId: string;
}

export default function SharePointVideoEmbed({ url, courseId }: SharePointVideoEmbedProps) {
  const [hasAuthenticatedInTab, setHasAuthenticatedInTab] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [showInstructions, setShowInstructions] = useState(true);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebugLogs, setShowDebugLogs] = useState(false);

  // Extract URL from iframe HTML if needed
  const extractUrl = (input: string): string => {
    if (input.includes('<iframe')) {
      const srcMatch = input.match(/src=["']([^"']+)["']/);
      if (srcMatch) {
        return srcMatch[1];
      }
    }
    return input;
  };

  // Fix the SharePoint embed URL to include proper parent parameter
  const getProperEmbedUrl = useCallback((inputUrl: string): string => {
    try {
      const extractedUrl = extractUrl(inputUrl);
      const url = new URL(extractedUrl);
      
      // Ensure we're using the embed endpoint
      if (!url.pathname.includes('/_layouts/15/embed.aspx')) {
        // If it's not already an embed URL, we can't fix it here
        // Just return the original URL
        return extractedUrl;
      }
      
      // Get the current site's origin
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      
      // Update or add the parent parameter
      if (currentOrigin) {
        url.searchParams.set('parent', currentOrigin);
      }
      
      // Add a cache buster to force reload after authentication
      url.searchParams.set('_t', Date.now().toString());
      
      return url.toString();
    } catch (e) {
      console.error('Error processing SharePoint URL:', e);
      return extractUrl(inputUrl);
    }
  }, []);

  const embedUrl = getProperEmbedUrl(url);

  // Debug logging
  const addDebugLog = useCallback((message: string, data?: any) => {
    const timestamp = new Date().toISOString().substring(11, 23);
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage, data || '');
    setDebugLogs(prev => [...prev, logMessage + (data ? ` | ${JSON.stringify(data)}` : '')]);
  }, []);

  useEffect(() => {
    addDebugLog('SharePoint Video Component Initialized', {
      originalUrl: url,
      embedUrl: embedUrl,
      hasParentParam: embedUrl.includes('parent='),
      courseId: courseId
    });
  }, [url, embedUrl, courseId, addDebugLog]);

  // Handle authentication in new tab
  const handleAuthenticateInNewTab = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    setIsLoading(true);
    addDebugLog('Opening SharePoint authentication in new tab');
    
    // Open the video URL in a new tab for authentication
    const authWindow = window.open(embedUrl, '_blank');
    
    // Show instructions for user
    setShowInstructions(true);
    setIsLoading(false);
    
    // Give user time to authenticate, then they can click "I've Signed In"
    addDebugLog('Waiting for user to complete authentication in new tab');
  }, [embedUrl, addDebugLog]);

  // User confirms they've authenticated
  const handleAuthenticationComplete = useCallback(() => {
    addDebugLog('User confirmed authentication complete, reloading iframe');
    setHasAuthenticatedInTab(true);
    setShowInstructions(false);
    // Force iframe reload with new timestamp
    setIframeKey(prev => prev + 1);
  }, [addDebugLog]);

  // Retry with fresh URL
  const handleRetry = useCallback(() => {
    addDebugLog('Retrying with fresh embed URL');
    setIframeKey(prev => prev + 1);
    setHasAuthenticatedInTab(false);
    setShowInstructions(true);
  }, [addDebugLog]);

  const handleIframeLoad = useCallback(() => {
    addDebugLog('SharePoint iframe loaded');
    setIsLoading(false);
  }, [addDebugLog]);

  const toggleDebugLogs = () => {
    setShowDebugLogs(!showDebugLogs);
  };

  // Check for third-party cookie blocking
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.userAgent.includes('Chrome')) {
      // Chrome is blocking third-party cookies by default
      addDebugLog('Note: Chrome blocks third-party cookies by default which may prevent SharePoint authentication in iframes');
    }
  }, [addDebugLog]);

  return (
    <div className="space-y-4">
      {/* Instructions for first-time authentication */}
      {showInstructions && !hasAuthenticatedInTab && (
        <div className="rounded-lg border p-6 bg-blue-50">
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-blue-900">SharePoint Video - Authentication Required</h3>
              <p className="text-sm text-blue-700 mt-1">
                To view this SharePoint video, you need to authenticate with your Microsoft 365 account.
              </p>
            </div>

            <div className="space-y-3">
              <div className="bg-white p-4 rounded border border-blue-200">
                <p className="text-sm font-medium mb-2">Steps to view the video:</p>
                <ol className="text-sm space-y-1 ml-4">
                  <li>1. Click "Open SharePoint Login" below</li>
                  <li>2. Sign in with your Microsoft 365 credentials in the new tab</li>
                  <li>3. Once signed in, close that tab and return here</li>
                  <li>4. Click "I've Signed In" to load the video</li>
                </ol>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleAuthenticateInNewTab}
                  disabled={isLoading}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Open SharePoint Login
                </button>
                
                <button
                  onClick={handleAuthenticationComplete}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  I've Signed In
                </button>
                
                <a
                  href={embedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-gray-300 px-4 py-2 rounded hover:bg-gray-50 inline-flex items-center"
                >
                  Open Video Directly →
                </a>
              </div>

              <div className="text-xs text-gray-600 bg-yellow-50 p-3 rounded border border-yellow-200">
                <strong>Note:</strong> If the video doesn't load after signing in, your browser may be blocking third-party cookies. 
                Try enabling cookies for *.sharepoint.com or use "Open Video Directly" to view in SharePoint.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video iframe (shown after authentication or when trying) */}
      {(hasAuthenticatedInTab || !showInstructions) && (
        <div className="relative w-full">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded">
              <div className="text-sm text-gray-600">Loading SharePoint video...</div>
            </div>
          )}
          
          <iframe
            key={iframeKey}
            src={embedUrl}
            className="w-full aspect-video rounded border"
            allow="autoplay; fullscreen"
            allowFullScreen
            onLoad={handleIframeLoad}
            title="SharePoint Video"
          />
          
          <div className="mt-2 flex justify-between items-center">
            <div className="flex gap-2">
              <button
                onClick={handleRetry}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                ↻ Retry Loading
              </button>
              {hasAuthenticatedInTab && (
                <button
                  onClick={() => {
                    setHasAuthenticatedInTab(false);
                    setShowInstructions(true);
                  }}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  Re-authenticate
                </button>
              )}
            </div>
            <button
              onClick={toggleDebugLogs}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              {showDebugLogs ? 'Hide' : 'Show'} Debug Info
            </button>
          </div>

          {/* Warning about potential issues */}
          {hasAuthenticatedInTab && (
            <div className="mt-3 text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
              If you see a sign-in page instead of the video, click "Open Video Directly" to view in SharePoint, 
              or check that third-party cookies are enabled for *.sharepoint.com
            </div>
          )}
        </div>
      )}

      {/* Debug logs */}
      {showDebugLogs && (
        <div className="mt-2 p-3 bg-gray-100 rounded text-xs font-mono space-y-1 max-h-60 overflow-y-auto">
          <div className="font-bold">Debug Information:</div>
          <div>Original URL: {url.substring(0, 100)}...</div>
          <div>Embed URL: {embedUrl.substring(0, 150)}...</div>
          <div>Has Parent Param: {embedUrl.includes('parent=') ? 'Yes' : 'No'}</div>
          <div>Authenticated: {hasAuthenticatedInTab ? 'Yes' : 'No'}</div>
          <div className="mt-2 font-bold">Logs:</div>
          {debugLogs.map((log, index) => (
            <div key={index}>{log}</div>
          ))}
        </div>
      )}
    </div>
  );
}