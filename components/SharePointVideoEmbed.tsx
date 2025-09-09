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

  // Debug logging function
  const addDebugLog = useCallback((message: string, data?: any) => {
    const timestamp = new Date().toISOString().substring(11, 23);
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage, data || '');
    setDebugLogs(prev => [...prev, logMessage + (data ? ` | ${JSON.stringify(data)}` : '')]);
  }, []);

  useEffect(() => {
    setIsMounted(true);
    addDebugLog('Component mounted', { url, courseId });
  }, [courseId, url, addDebugLog]);

  const handleAuthenticate = useCallback(async () => {
    if (typeof window === 'undefined') return;

    try {
      setIsLoading(true);
      setAuthError(null);
      setAuthAttempted(true);

      addDebugLog('Starting SharePoint authentication flow');

      // Get the SharePoint domain from the video URL
      const sharePointUrl = new URL(url);
      const sharePointDomain = sharePointUrl.hostname;
      addDebugLog('SharePoint domain extracted', { sharePointDomain });

      // Start with the video URL directly - this often works better
      const authUrl = url;
      addDebugLog('Using direct video URL for authentication', { authUrl });

      // Open SharePoint authentication in a new window
      const authWindow = window.open(
        authUrl,
        'sharepoint_auth',
        'width=1200,height=800,scrollbars=yes,resizable=yes,location=yes,menubar=yes,toolbar=yes'
      );

      if (!authWindow) {
        const errorMsg = 'Popup blocked. Please allow popups and try again.';
        addDebugLog('Auth window failed to open', { error: errorMsg });
        setAuthError(errorMsg);
        setIsLoading(false);
        return;
      }

      addDebugLog('Auth window opened successfully');

      // Focus the auth window
      try {
        authWindow.focus();
        addDebugLog('Auth window focused');
      } catch (e: any) {
        addDebugLog('Failed to focus auth window', { error: e.message });
      }

      // Monitor the auth window with simpler logic
      let checkInterval: NodeJS.Timeout;
      let authCompleted = false;

      const checkAuth = () => {
        try {
          // Check if window is closed
          if (authWindow && authWindow.closed) {
            addDebugLog('Auth window closed - assuming authentication completed');
            clearInterval(checkInterval);

            if (!authCompleted) {
              authCompleted = true;

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
          }
        } catch (e: any) {
          addDebugLog('Error in checkAuth', { error: e.message });
        }
      };

      // Start checking immediately and then every 1 second
      checkAuth();
      checkInterval = setInterval(checkAuth, 1000);

      // Auto-close after 5 minutes and assume success
      setTimeout(() => {
        addDebugLog('Auth timeout reached (5 minutes)');
        clearInterval(checkInterval);
        if (authWindow && !authWindow.closed) {
          try {
            authWindow.close();
            addDebugLog('Auth window closed due to timeout');
          } catch (e: any) {
            addDebugLog('Error closing auth window on timeout', { error: e.message });
          }
        }

        // If still loading, assume authentication was successful
        if (isLoading && !authCompleted) {
          addDebugLog('Timeout reached, assuming authentication completed');
          authCompleted = true;
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
        }
      }, 300000);

    } catch (e: any) {
      const errorMsg = `Error in handleAuthenticate: ${e.message}`;
      addDebugLog('handleAuthenticate error', { error: errorMsg });
      setAuthError('Failed to open authentication window. Please try again.');
      setIsLoading(false);
    }
  }, [url, courseId, isLoading, authAttempted, addDebugLog]);

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') return;

    addDebugLog('Starting authentication check');

    // Parse SharePoint URL for debugging
    try {
      const parsedUrl = new URL(url);
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
          addDebugLog('Auto-triggering authentication');
          handleAuthenticate();
        }
      }, 1000);
    }

    return () => {
      if (authCheckTimeoutRef.current) {
        clearTimeout(authCheckTimeoutRef.current);
      }
    };
  }, [courseId, isMounted, url, isAuthenticated, authAttempted, handleAuthenticate, addDebugLog]);

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
              {isLoading ? 'Authenticating...' : 'Authenticate with SharePoint'}
            </button>
            {authAttempted && (
              <button
                onClick={clearAuthAndRetry}
                className="border border-gray-300 px-4 py-2 rounded hover:bg-gray-50"
              >
                Try Again
              </button>
            )}
          </div>

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
          src={url}
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