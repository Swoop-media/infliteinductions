
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
      addDebugLog('SharePoint authentication required');
      setShowAuthPrompt(true);
      setIsLoading(false);
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

      // Try multiple authentication URL patterns
      const authUrls = [
        `https://${sharePointDomain}/_layouts/15/authenticate.aspx?Source=${encodeURIComponent(url)}`,
        `https://${sharePointDomain}/_login/`,
        `https://${sharePointDomain}/_layouts/15/start.aspx`,
        url // Direct to video URL as fallback
      ];

      addDebugLog('Authentication URLs prepared', { authUrls });

      let authWindow: Window | null = null;

      // Try each authentication URL
      for (let i = 0; i < authUrls.length; i++) {
        const authUrl = authUrls[i];
        addDebugLog(`Attempting authentication with URL ${i + 1}`, { authUrl });

        // Open SharePoint authentication in a new window
        authWindow = window.open(
          authUrl,
          'sharepoint_auth',
          'width=1200,height=800,scrollbars=yes,resizable=yes,location=yes,menubar=yes,toolbar=yes'
        );

        if (!authWindow) {
          addDebugLog(`Failed to open auth window for URL ${i + 1}`);
          continue;
        }

        addDebugLog(`Auth window opened for URL ${i + 1}`);
        break;
      }

      if (!authWindow) {
        const errorMsg = 'Popup blocked. Please allow popups and try again.';
        addDebugLog('All auth window attempts failed', { error: errorMsg });
        setAuthError(errorMsg);
        setIsLoading(false);
        return;
      }

      // Focus the auth window
      try {
        authWindow.focus();
        addDebugLog('Auth window focused');
      } catch (e) {
        addDebugLog('Failed to focus auth window', { error: e.message });
      }

      // Monitor the auth window
      let checkInterval: NodeJS.Timeout;
      let authCompleted = false;
      let lastKnownUrl = '';

      const checkAuth = async () => {
        try {
          // Check if window is closed
          if (authWindow && authWindow.closed) {
            addDebugLog('Auth window closed by user');
            clearInterval(checkInterval);

            if (!authCompleted) {
              addDebugLog('Marking as authenticated after window close');
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
            return;
          }

          // Try to detect successful authentication by checking the URL
          try {
            if (authWindow && authWindow.location && authWindow.location.href) {
              const currentUrl = authWindow.location.href;
              
              if (currentUrl !== lastKnownUrl) {
                lastKnownUrl = currentUrl;
                addDebugLog('Auth window URL changed', { currentUrl });

                // Check for successful authentication indicators
                const successIndicators = [
                  sharePointDomain,
                  'access_token',
                  'authenticated',
                  'success'
                ];

                const failureIndicators = [
                  'login',
                  'signin',
                  'authenticate.aspx',
                  'error',
                  'denied'
                ];

                const hasSuccess = successIndicators.some(indicator => 
                  currentUrl.toLowerCase().includes(indicator.toLowerCase())
                );
                
                const hasFailure = failureIndicators.some(indicator => 
                  currentUrl.toLowerCase().includes(indicator.toLowerCase())
                );

                addDebugLog('URL analysis', { hasSuccess, hasFailure, currentUrl });

                // If we can access the URL and it looks successful
                if (hasSuccess && !hasFailure && currentUrl.includes(sharePointDomain)) {
                  if (!authCompleted) {
                    addDebugLog('Authentication appears successful based on URL analysis');
                    authCompleted = true;
                    try {
                      authWindow.close();
                    } catch (e) {
                      addDebugLog('Error closing auth window', { error: e.message });
                    }
                  }
                }
              }
            }
          } catch (e) {
            // Cross-origin restrictions - this is expected during auth flow
            addDebugLog('Cross-origin restriction (expected)', { error: e.message });
          }
        } catch (e) {
          addDebugLog('Error in checkAuth function', { error: e.message });
        }
      };

      checkInterval = setInterval(checkAuth, 1000);
      addDebugLog('Started auth monitoring interval');

      // Clear interval and close window after 5 minutes if still open
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
        if (isLoading && !authCompleted) {
          const timeoutError = 'Authentication timed out. Please try again.';
          addDebugLog('Auth process timed out', { error: timeoutError });
          setIsLoading(false);
          setAuthError(timeoutError);
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
    
    // Try to detect if SharePoint is showing a login screen
    if (iframeRef.current && isAuthenticated) {
      try {
        setTimeout(() => {
          // Check if the iframe contains typical SharePoint auth elements
          const iframe = iframeRef.current;
          if (iframe && iframe.contentDocument) {
            const doc = iframe.contentDocument;
            const signInElements = doc.querySelector('[data-automation-id="signInButton"], .signin-button, #idSIButton9, .ms-Button--primary');
            const authContainers = doc.querySelector('.auth-container, .sign-in-container, .ms-signInContainer');
            
            if (signInElements || authContainers) {
              addDebugLog('Detected SharePoint login screen in iframe, clearing cached auth');
              clearAuthAndRetry();
              return;
            }
          }
          
          // If we can't access the content, assume it loaded successfully
          addDebugLog('SharePoint content loaded (cross-origin restrictions prevent inspection)');
          setIsLoading(false);
        }, 3000); // Wait 3 seconds for content to load
      } catch (e) {
        // Cross-origin restrictions prevent access - this is expected
        addDebugLog('Cannot access iframe content (cross-origin)', { error: e.message });
        setIsLoading(false);
      }
    }
    
    if (isAuthenticated) {
      // Set a timeout to show refresh option if user might be stuck on login screen
      setTimeout(() => {
        if (isAuthenticated) {
          addDebugLog('SharePoint should be loaded, if you see login screen, session may have expired');
        }
      }, 5000);
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
          <h3 className="text-lg font-medium text-gray-900 mb-2">SharePoint Video Authentication Required</h3>
          <p className="text-sm text-gray-600 mb-4">
            This video is hosted on SharePoint and requires you to sign in with your Microsoft account. You only need to do this once per course.
          </p>
          
          <div className="space-y-3">
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
              {isLoading ? 'Authenticating...' : 'Sign in to SharePoint'}
            </button>

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
