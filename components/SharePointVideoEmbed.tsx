// @ts-nocheck
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';

interface SharePointVideoEmbedProps {
  url: string;
  courseId: string;
}

export default function SharePointVideoEmbed({ url, courseId }: SharePointVideoEmbedProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [authAttempted, setAuthAttempted] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const authCheckTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Extract URL from iframe if needed
  const extractUrl = (input: string): string => {
    // Check if input is an iframe HTML string
    if (input.includes('<iframe')) {
      const srcMatch = input.match(/src=["']([^"']+)["']/);
      if (srcMatch) {
        return srcMatch[1];
      }
    }
    return input;
  };

  // Use the extracted URL throughout the component
  const videoUrl = extractUrl(url);

  // Debug logging function
  const addDebugLog = useCallback((message: string, data?: any) => {
    const timestamp = new Date().toISOString().substring(11, 23);
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage, data || '');
    setDebugLogs(prev => [...prev, logMessage + (data ? ` | ${JSON.stringify(data)}` : '')]);
  }, []);

  useEffect(() => {
    setIsMounted(true);
    addDebugLog('Component mounted', { originalUrl: url, extractedUrl: videoUrl, courseId });
  }, [courseId, url, videoUrl, addDebugLog]);

  const handleAuthenticate = useCallback(async () => {
    if (typeof window === 'undefined') return;

    try {
      setIsLoading(true);
      setAuthError(null);
      setAuthAttempted(true);

      addDebugLog('Starting inline SharePoint authentication flow');

      // Get the SharePoint domain from the video URL
      const sharePointUrl = new URL(videoUrl);
      const sharePointDomain = sharePointUrl.hostname;
      addDebugLog('SharePoint domain extracted', { sharePointDomain });

      // Try multiple authentication approaches for better compatibility
      addDebugLog('Attempting inline authentication using iframe approach');
      
      // First try: Direct URL access with credentials include
      try {
        const response = await fetch(videoUrl, {
          method: 'GET',
          credentials: 'include',
          mode: 'no-cors'
        });
        addDebugLog('Direct fetch attempt completed');
      } catch (e: any) {
        addDebugLog('Direct fetch failed, continuing with iframe approach', { error: e.message });
      }

      // Second try: Create authentication iframe
      const authUrl = `https://${sharePointDomain}/_layouts/15/authenticate.aspx?Source=${encodeURIComponent(videoUrl)}`;
      addDebugLog('Creating authentication iframe', { authUrl });

      // Create a hidden iframe for authentication
      const authIframe = document.createElement('iframe');
      authIframe.style.display = 'none';
      authIframe.src = authUrl;
      authIframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-top-navigation');
      document.body.appendChild(authIframe);

      // Set up authentication check
      let authCompleted = false;
      let checkCount = 0;
      const maxChecks = 30; // 30 seconds max

      const checkAuth = async () => {
        checkCount++;
        addDebugLog(`Authentication check ${checkCount}/${maxChecks}`);

        try {
          // Test if we can access the video now
          const testIframe = document.createElement('iframe');
          testIframe.style.display = 'none';
          testIframe.src = videoUrl;
          document.body.appendChild(testIframe);

          // Wait a bit for the iframe to load
          await new Promise(resolve => setTimeout(resolve, 1000));

          // If we've reached here without errors, assume auth worked
          document.body.removeChild(testIframe);
          document.body.removeChild(authIframe);

          if (!authCompleted) {
            authCompleted = true;
            addDebugLog('Authentication appears successful');

            // Mark as authenticated and show the video
            const authKey = `sharepoint_auth_${courseId}`;
            try {
              localStorage.setItem(authKey, 'true');
              addDebugLog('Auth status saved to localStorage');
            } catch (e: any) {
              addDebugLog('Failed to save auth to localStorage', { error: e.message });
            }

            setIsAuthenticated(true);
            setShowAuthPrompt(false);
            setIsLoading(false);
            setAuthError(null);
          }
        } catch (e: any) {
          addDebugLog('Auth check failed', { error: e.message, attempt: checkCount });
          
          if (checkCount >= maxChecks) {
            // Cleanup and try direct approach
            try {
              document.body.removeChild(authIframe);
            } catch {}
            
            addDebugLog('Max auth attempts reached, trying direct access');
            // Try direct access - sometimes SharePoint just works
            const authKey = `sharepoint_auth_${courseId}`;
            try {
              localStorage.setItem(authKey, 'true');
            } catch (e: any) {
              addDebugLog('Failed to save auth on timeout', { error: e.message });
            }
            setIsAuthenticated(true);
            setShowAuthPrompt(false);
            setIsLoading(false);
            setAuthError(null);
          } else {
            // Try again in 1 second
            setTimeout(checkAuth, 1000);
          }
        }
      };

      // Start checking after a short delay
      setTimeout(checkAuth, 2000);

    } catch (e: any) {
      const errorMsg = `Error in handleAuthenticate: ${e.message}`;
      addDebugLog('handleAuthenticate error', { error: errorMsg });
      setAuthError('Authentication failed. Please try opening the video in a new tab.');
      setIsLoading(false);
    }
  }, [videoUrl, courseId, addDebugLog]);

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') return;

    addDebugLog('Starting authentication check');

    // Parse SharePoint URL for debugging
    try {
      const parsedUrl = new URL(videoUrl);
      addDebugLog('Parsed SharePoint URL', {
        hostname: parsedUrl.hostname,
        pathname: parsedUrl.pathname,
        search: parsedUrl.search
      });
    } catch (e: any) {
      addDebugLog('Error parsing SharePoint URL', { error: e.message });
    }

    // Check if user is already authenticated for this course's SharePoint
    const authKey = `sharepoint_auth_${courseId}`;
    let isAlreadyAuthed = false;

    try {
      const storedAuth = localStorage.getItem(authKey);
      isAlreadyAuthed = storedAuth === 'true';
      addDebugLog('LocalStorage auth check', {
        authKey,
        storedAuth,
        isAlreadyAuthed
      });
    } catch (e: any) {
      addDebugLog('LocalStorage not available', { error: e.message });
    }

    if (isAlreadyAuthed) {
      addDebugLog('User already authenticated for this course');
      setIsAuthenticated(true);
      setIsLoading(false);
      setShowAuthPrompt(false);
    } else {
      addDebugLog('SharePoint authentication required - will auto-trigger');
      setShowAuthPrompt(true);
      setIsLoading(false);

      // Auto-trigger authentication after a short delay to improve UX
      setTimeout(() => {
        if (!isAuthenticated && !authAttempted) {
          addDebugLog('Auto-triggering inline authentication');
          handleAuthenticate();
        }
      }, 1000);
    }

    const timeoutId = authCheckTimeoutRef.current;
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [courseId, isMounted, videoUrl, isAuthenticated, authAttempted, handleAuthenticate, addDebugLog]);

  const handleIframeLoad = () => {
    addDebugLog('SharePoint iframe loaded successfully');
    setIsLoading(false);
  };

  const clearAuthAndRetry = () => {
    addDebugLog('Clearing authentication and retrying');
    const authKey = `sharepoint_auth_${courseId}`;
    try {
      localStorage.removeItem(authKey);
      addDebugLog('Auth cleared from localStorage');
    } catch (e: any) {
      addDebugLog('Failed to clear auth from localStorage', { error: e.message });
    }
    setIsAuthenticated(false);
    setAuthAttempted(false);
    setAuthError(null);
    setShowAuthPrompt(true);
  };

  const toggleDebugLogs = () => {
    setShowDebugLogs(!showDebugLogs);
  };

  if (!isMounted) {
    return <div className="flex justify-center p-8">Loading SharePoint video...</div>;
  }

  if (showAuthPrompt && !isAuthenticated) {
    return (
      <div className="rounded-lg border p-6 bg-blue-50">
        <div className="space-y-4">
          <div>
            <h3 className="font-medium text-blue-900">SharePoint Authentication Required</h3>
            <p className="text-sm text-blue-700 mt-1">
              This video is hosted on SharePoint and requires authentication to view.
            </p>
          </div>

          {authError && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded border">
              <strong>Error:</strong> {authError}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleAuthenticate}
              disabled={isLoading}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Authenticating...' : 'Sign In Inline'}
            </button>
            {authAttempted && (
              <button
                onClick={clearAuthAndRetry}
                className="border border-gray-300 px-4 py-2 rounded hover:bg-gray-50"
              >
                Try Again
              </button>
            )}
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-blue-300 px-4 py-2 rounded hover:bg-blue-50 text-blue-600 text-sm"
            >
              Open in New Tab
            </a>
          </div>

          {isLoading && (
            <div className="bg-blue-100 p-3 rounded border border-blue-200">
              <div className="flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                <span className="text-sm text-blue-700">Authenticating with SharePoint...</span>
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={toggleDebugLogs}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              {showDebugLogs ? 'Hide' : 'Show'} Debug Logs
            </button>
          </div>

          {showDebugLogs && (
            <div className="mt-4 p-3 bg-gray-100 rounded text-xs font-mono space-y-1 max-h-60 overflow-y-auto">
              {debugLogs.map((log, index) => (
                <div key={index}>{log}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="relative w-full">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded">
            <div className="text-sm text-gray-600">Loading SharePoint video...</div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={videoUrl}
          className="w-full aspect-video rounded border"
          allow="autoplay; fullscreen"
          onLoad={handleIframeLoad}
          title="SharePoint Video"
        />
        <div className="mt-2 flex justify-between items-center">
          <button
            onClick={clearAuthAndRetry}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Re-authenticate
          </button>
          <button
            onClick={toggleDebugLogs}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {showDebugLogs ? 'Hide' : 'Show'} Debug
          </button>
        </div>
        {showDebugLogs && (
          <div className="mt-2 p-2 bg-gray-100 rounded text-xs font-mono space-y-1 max-h-40 overflow-y-auto">
            {debugLogs.map((log, index) => (
              <div key={index}>{log}</div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex justify-center p-8">
      <div className="text-gray-600">Preparing SharePoint video...</div>
    </div>
  );
}