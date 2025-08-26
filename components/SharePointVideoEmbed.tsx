
"use client";

import { useState, useEffect, useRef } from 'react';

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
  const authCheckTimeoutRef = useRef<NodeJS.Timeout>();

  // Debug logging function
  const addDebugLog = (message: string, data?: any) => {
    const timestamp = new Date().toISOString().substring(11, 23);
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage, data || '');
    setDebugLogs(prev => [...prev, logMessage + (data ? ` | ${JSON.stringify(data)}` : '')]);
  };

  useEffect(() => {
    setIsMounted(true);
    addDebugLog('Component mounted', { url, courseId });
  }, []);

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
    } catch (e) {
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
    } catch (e) {
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
  }, [courseId, isMounted, url]);

  const handleAuthenticate = async () => {
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
      } catch (e) {
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
              } catch (e) {
                addDebugLog('Failed to save auth to localStorage', { error: e.message });
              }

              setIsAuthenticated(true);
              setShowAuthPrompt(false);
              setIsLoading(false);
              setAuthError(null);
            }
          }
        } catch (e) {
          addDebugLog('Error in checkAuth function', { error: e.message });
        }
      };

      checkInterval = setInterval(checkAuth, 1000);
      addDebugLog('Started auth monitoring');

      // Auto-close after 5 minutes and assume success
      setTimeout(() => {
        addDebugLog('Auth timeout reached (5 minutes)');
        clearInterval(checkInterval);
        if (authWindow && !authWindow.closed) {
          try {
            authWindow.close();
            addDebugLog('Auth window closed due to timeout');
          } catch (e) {
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
          } catch (e) {
            addDebugLog('Failed to save auth on timeout', { error: e.message });
          }
          setIsAuthenticated(true);
          setShowAuthPrompt(false);
          setIsLoading(false);
          setAuthError(null);
        }
      }, 300000);

    } catch (e) {
      const errorMsg = `Error in handleAuthenticate: ${e.message}`;
      addDebugLog('handleAuthenticate error', { error: errorMsg });
      setAuthError('Failed to open authentication window. Please try again.');
      setIsLoading(false);
    }
  };

  const handleIframeLoad = () => {
    addDebugLog('SharePoint iframe loaded successfully');
    
    // Always hide loading when iframe loads
    setIsLoading(false);
    
    // If we're authenticated but the iframe might be showing a login screen,
    // try to detect it and automatically retry
    if (isAuthenticated) {
      setTimeout(() => {
        try {
          // Since we can't access iframe content due to cross-origin restrictions,
          // we'll use a different approach - check the iframe's title or URL if possible
          const iframe = iframeRef.current;
          if (iframe) {
            // Try to detect login screen by checking the iframe source
            // If SharePoint redirects to a login page, it might change the URL
            try {
              const iframeSrc = iframe.src;
              if (iframeSrc && (iframeSrc.includes('login') || iframeSrc.includes('signin'))) {
                addDebugLog('Detected potential login redirect, retrying authentication');
                clearAuthAndRetry();
                return;
              }
            } catch (e) {
              addDebugLog('Cannot check iframe src', { error: e.message });
            }
            
            // Alternative: check if iframe is very small (sign of login prompt)
            const rect = iframe.getBoundingClientRect();
            if (rect.height < 200) {
              addDebugLog('Iframe appears to be showing minimal content, might be login screen');
            }
          }
          
          addDebugLog('SharePoint content appears to be loaded');
        } catch (e) {
          addDebugLog('Error checking iframe content', { error: e.message });
        }
      }, 2000); // Check after 2 seconds
    }
  };

  const handleIframeError = () => {
    addDebugLog('SharePoint iframe failed to load');
    setIsLoading(false);
    if (!isAuthenticated) {
      setAuthError('Failed to load video. Please try authenticating again.');
    }
  };

  const clearAuthAndRetry = () => {
    addDebugLog('Clearing authentication and retrying');
    const authKey = `sharepoint_auth_${courseId}`;
    try {
      localStorage.removeItem(authKey);
      addDebugLog('Auth cleared from localStorage');
    } catch (e) {
      addDebugLog('Failed to clear auth from localStorage', { error: e.message });
    }
    
    setIsAuthenticated(false);
    setShowAuthPrompt(true);
    setAuthError(null);
    setAuthAttempted(false);
  };

  if (!isMounted) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (showAuthPrompt && !isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center p-6 max-w-lg">
          <div className="mb-4">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Connecting to SharePoint Video</h3>
          <p className="text-sm text-gray-600 mb-4">
            {authAttempted ? 
              'If the authentication window closed, the video should load automatically. If you still see this message, please click to retry.' :
              'This video requires Microsoft authentication. A sign-in window will open automatically.'
            }
          </p>
          
          <div className="space-y-3">
            {!authAttempted ? (
              <div className="w-full inline-flex items-center justify-center px-4 py-2 text-sm text-gray-600">
                <div className="w-4 h-4 mr-2 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                Opening authentication window...
              </div>
            ) : (
              <button
                onClick={handleAuthenticate}
                disabled={isLoading}
                className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 23 23" fill="currentColor">
                    <path d="M11.03 0H0v11.03h11.03V0z"/>
                    <path d="M23 0H11.97v11.03H23V0z"/>
                    <path d="M11.03 11.97H0V23h11.03V11.97z"/>
                    <path d="M23 11.97H11.97V23H23V11.97z"/>
                  </svg>
                )}
                {isLoading ? 'Authenticating...' : 'Retry Authentication'}
              </button>
            )}

            {authAttempted && (
              <button
                onClick={clearAuthAndRetry}
                className="w-full text-sm text-gray-600 hover:text-gray-800 underline"
              >
                Clear cache and try again
              </button>
            )}
            
            {isAuthenticated && (
              <button
                onClick={clearAuthAndRetry}
                className="w-full text-sm text-blue-600 hover:text-blue-800 underline"
              >
                Refresh SharePoint authentication
              </button>
            )}

            <button
              onClick={() => setShowDebugLogs(!showDebugLogs)}
              className="w-full text-xs text-gray-500 hover:text-gray-700 underline"
            >
              {showDebugLogs ? 'Hide' : 'Show'} Debug Logs
            </button>
          </div>

          <p className="text-xs text-gray-500 mt-3">
            A new window will open for authentication. Close the window after signing in.
          </p>
          
          {authError && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded">
              <p className="text-xs text-red-600">{authError}</p>
            </div>
          )}

          {showDebugLogs && (
            <div className="mt-4 p-3 bg-gray-100 border rounded text-left">
              <h4 className="text-xs font-semibold mb-2">Debug Logs:</h4>
              <div className="text-xs text-gray-700 max-h-40 overflow-y-auto space-y-1">
                {debugLogs.map((log, index) => (
                  <div key={index} className="font-mono text-xs break-all">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">Setting up video...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      {/* Show loading while iframe loads */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-600">Loading video...</p>
          </div>
        </div>
      )}

      {/* Debug info overlay (only in development) */}
      {process.env.NODE_ENV === 'development' && debugLogs.length > 0 && (
        <div className="absolute top-2 right-2 z-20">
          <button
            onClick={() => setShowDebugLogs(!showDebugLogs)}
            className="text-xs bg-gray-800 text-white px-2 py-1 rounded"
          >
            Debug ({debugLogs.length})
          </button>
          {showDebugLogs && (
            <div className="absolute top-8 right-0 w-80 max-h-60 bg-white border shadow-lg rounded p-2 overflow-y-auto">
              <div className="text-xs space-y-1">
                {debugLogs.slice(-10).map((log, index) => (
                  <div key={index} className="font-mono text-xs break-all">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <iframe
        ref={iframeRef}
        src={url}
        className="h-full w-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer-when-downgrade"
        onLoad={handleIframeLoad}
        onError={handleIframeError}
      />
      
      {/* Refresh button overlay - shown when authenticated but potentially stuck on login */}
      {isAuthenticated && !isLoading && (
        <div className="absolute bottom-4 right-4 z-30">
          <button
            onClick={clearAuthAndRetry}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md text-sm font-medium shadow-lg flex items-center gap-2"
            title="If you're seeing a login screen, click to refresh authentication"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh Auth
          </button>
        </div>
      )}
    </div>
  );
}
