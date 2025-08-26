
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
  const [needsAuth, setNeedsAuth] = useState(false);
  const [authAttempted, setAuthAttempted] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const authCheckTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') return;
    
    // Check if user is already authenticated for this course's SharePoint
    const authKey = `sharepoint_auth_${courseId}`;
    let isAlreadyAuthed = false;
    
    try {
      isAlreadyAuthed = localStorage.getItem(authKey) === 'true';
    } catch (e) {
      console.warn('localStorage not available:', e);
    }
    
    if (isAlreadyAuthed) {
      console.log('User already authenticated for this course');
      setIsAuthenticated(true);
      setIsLoading(false);
      setShowAuthPrompt(false);
      setNeedsAuth(false);
    } else {
      // Start by trying to load the iframe
      setIsLoading(true);
      setShowAuthPrompt(false);
      setNeedsAuth(false);
      
      // Set a timeout to check if authentication is needed
      authCheckTimeoutRef.current = setTimeout(() => {
        if (!isAuthenticated && !authAttempted) {
          console.log('Iframe failed to load after timeout, showing auth prompt');
          setNeedsAuth(true);
          setShowAuthPrompt(true);
          setIsLoading(false);
        }
      }, 8000); // Wait 8 seconds for iframe to load
    }

    return () => {
      if (authCheckTimeoutRef.current) {
        clearTimeout(authCheckTimeoutRef.current);
      }
    };
  }, [courseId, isMounted, isAuthenticated, authAttempted]);

  const handleIframeLoad = () => {
    if (typeof window === 'undefined') return;
    
    console.log('Iframe loaded successfully');
    
    // Clear the auth check timeout since iframe loaded
    if (authCheckTimeoutRef.current) {
      clearTimeout(authCheckTimeoutRef.current);
    }
    
    try {
      // Check if the iframe actually loaded the video or if it's showing a login page
      // We'll assume if it loads quickly without error, it's authenticated
      const authKey = `sharepoint_auth_${courseId}`;
      localStorage.setItem(authKey, 'true');
      setIsAuthenticated(true);
      setShowAuthPrompt(false);
      setNeedsAuth(false);
      setAuthError(null);
      setIsLoading(false);
    } catch (e) {
      console.warn('Error in handleIframeLoad:', e);
    }
  };

  const handleIframeError = () => {
    console.log('Iframe failed to load due to error');
    
    // Clear the auth check timeout
    if (authCheckTimeoutRef.current) {
      clearTimeout(authCheckTimeoutRef.current);
    }
    
    setNeedsAuth(true);
    setShowAuthPrompt(true);
    setIsLoading(false);
    setAuthError('Authentication required to view this video');
  };

  const handleAuthenticate = async () => {
    if (typeof window === 'undefined') return;

    try {
      setIsLoading(true);
      setAuthError(null);
      setAuthAttempted(true);

      console.log('Starting authentication flow');

      // Clear any existing authentication state
      const authKey = `sharepoint_auth_${courseId}`;
      localStorage.removeItem(authKey);

      // Create a more targeted auth URL - try to use the SharePoint domain for auth
      const sharePointUrl = new URL(url);
      const authUrl = `https://${sharePointUrl.hostname}/_layouts/15/authenticate.aspx`;

      // Open SharePoint authentication in a new window
      const authWindow = window.open(
        authUrl,
        'sharepoint_auth',
        'width=1200,height=800,scrollbars=yes,resizable=yes,location=yes,menubar=yes,toolbar=yes'
      );

      if (!authWindow) {
        setAuthError('Popup blocked. Please allow popups and try again.');
        setIsLoading(false);
        return;
      }

      // Focus the auth window
      authWindow.focus();

      // Monitor the auth window
      let checkInterval: NodeJS.Timeout;
      let authCompleted = false;
      
      const checkAuth = async () => {
        try {
          // Check if window is closed
          if (authWindow.closed) {
            clearInterval(checkInterval);
            
            if (!authCompleted) {
              console.log('Auth popup closed, attempting to reload video');
              
              // Mark auth as completed and try to load the video
              authCompleted = true;
              
              // Wait a moment for cookies/session to be established
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // Mark as authenticated and force reload the iframe
              localStorage.setItem(authKey, 'true');
              setIsAuthenticated(true);
              setShowAuthPrompt(false);
              setNeedsAuth(false);
              setIsLoading(false);
              
              // Force reload the iframe with a cache-busting parameter
              if (iframeRef.current) {
                const separator = url.includes('?') ? '&' : '?';
                const cacheBuster = `${separator}_t=${Date.now()}`;
                iframeRef.current.src = url + cacheBuster;
              }
            }
            return;
          }

          // Try to detect successful authentication by checking the URL
          try {
            const currentUrl = authWindow.location.href;
            if (currentUrl && !currentUrl.includes('login') && !currentUrl.includes('signin') && !currentUrl.includes('authenticate')) {
              if (!authCompleted) {
                console.log('Authentication appears successful, closing window');
                authCompleted = true;
                authWindow.close();
              }
            }
          } catch (e) {
            // Cross-origin restrictions - this is expected during auth flow
          }
        } catch (e) {
          console.warn('Error checking auth status:', e);
        }
      };

      checkInterval = setInterval(checkAuth, 1000);

      // Clear interval and close window after 10 minutes if still open
      setTimeout(() => {
        clearInterval(checkInterval);
        if (authWindow && !authWindow.closed) {
          try {
            authWindow.close();
          } catch (e) {
            console.warn('Error closing auth window:', e);
          }
        }
        if (isLoading && !authCompleted) {
          setIsLoading(false);
          setAuthError('Authentication timed out. Please try again.');
        }
      }, 600000);
    } catch (e) {
      console.error('Error in handleAuthenticate:', e);
      setAuthError('Failed to open authentication window. Please try again.');
      setIsLoading(false);
    }
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

  if ((showAuthPrompt && needsAuth) || (!isAuthenticated && needsAuth)) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center p-6">
          <div className="mb-4">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Video Authentication Required</h3>
          <p className="text-sm text-gray-600 mb-4">
            This video requires you to sign in with your Microsoft account. You only need to do this once per course.
          </p>
          <button
            onClick={handleAuthenticate}
            disabled={isLoading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
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
            {isLoading ? 'Authenticating...' : 'Sign in to Microsoft 365'}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            A new window will open for authentication. Sign in and close the window when done.
          </p>
          {authError && (
            <p className="text-xs text-red-600 mt-2">{authError}</p>
          )}
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
      
      <iframe
        ref={iframeRef}
        src={isAuthenticated ? (url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`) : url}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        style={{ display: needsAuth && showAuthPrompt ? 'none' : 'block' }}
      />
    </div>
  );
}
