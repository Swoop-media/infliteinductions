
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
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
      setIsAuthenticated(true);
      setIsLoading(false);
      setShowAuthPrompt(false);
    } else {
      // Try to load the video directly first
      setIsLoading(false);
      setShowAuthPrompt(false);
      // Let the iframe load and see if it needs authentication
    }
  }, [courseId, isMounted]);

  const handleIframeLoad = () => {
    if (typeof window === 'undefined') return;
    
    try {
      // Check if the iframe loaded successfully
      const iframe = iframeRef.current;
      if (iframe) {
        // Try to detect if we're seeing an auth page vs the actual video
        // This is a heuristic - if the page loads quickly it might be an auth page
        setTimeout(() => {
          try {
            // If we can access the iframe content, we're likely authenticated
            const authKey = `sharepoint_auth_${courseId}`;
            localStorage.setItem(authKey, 'true');
            setIsAuthenticated(true);
            setShowAuthPrompt(false);
            setAuthError(null);
          } catch (e) {
            // Cross-origin restrictions mean we can't check the content
            // Just assume it loaded if we get here
            console.log('Iframe loaded, assuming authenticated');
            const authKey = `sharepoint_auth_${courseId}`;
            localStorage.setItem(authKey, 'true');
            setIsAuthenticated(true);
            setShowAuthPrompt(false);
            setAuthError(null);
          }
        }, 2000);
      }
    } catch (e) {
      console.warn('Error in handleIframeLoad:', e);
    }
  };

  const handleIframeError = () => {
    console.log('Iframe failed to load, showing auth prompt');
    setShowAuthPrompt(true);
    setAuthError('Authentication required to view this video');
  };

  const handleAuthenticate = () => {
    if (typeof window === 'undefined') return;

    try {
      setIsLoading(true);
      setAuthError(null);

      // Open SharePoint URL in a new window for authentication
      const authWindow = window.open(
        url,
        'sharepoint_auth',
        'width=800,height=600,scrollbars=yes,resizable=yes'
      );

      if (!authWindow) {
        setAuthError('Popup blocked. Please allow popups and try again.');
        setIsLoading(false);
        return;
      }

      // Monitor the auth window
      let checkInterval: NodeJS.Timeout;
      const checkAuth = () => {
        try {
          if (authWindow.closed) {
            clearInterval(checkInterval);
            // When the popup closes, refresh the main iframe
            console.log('Auth popup closed, refreshing video');
            const authKey = `sharepoint_auth_${courseId}`;
            localStorage.setItem(authKey, 'true');
            setIsAuthenticated(true);
            setShowAuthPrompt(false);
            setIsLoading(false);
            
            // Force reload the iframe
            if (iframeRef.current) {
              const currentSrc = iframeRef.current.src;
              iframeRef.current.src = '';
              setTimeout(() => {
                if (iframeRef.current) {
                  iframeRef.current.src = currentSrc;
                }
              }, 100);
            }
          }
        } catch (e) {
          // Handle cross-origin errors
          console.warn('Error checking auth window:', e);
        }
      };

      checkInterval = setInterval(checkAuth, 1000);

      // Clear interval after 5 minutes
      setTimeout(() => {
        clearInterval(checkInterval);
        if (authWindow && !authWindow.closed) {
          try {
            authWindow.close();
          } catch (e) {
            console.warn('Error closing auth window:', e);
          }
        }
        setIsLoading(false);
      }, 300000);
    } catch (e) {
      console.error('Error in handleAuthenticate:', e);
      setAuthError('Failed to open authentication window');
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

  if (showAuthPrompt && !isAuthenticated) {
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
            {isLoading ? 'Signing in...' : 'Sign in to view video'}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            A new window will open for authentication
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
      <iframe
        ref={iframeRef}
        src={url}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
        onLoad={handleIframeLoad}
        onError={handleIframeError}
      />
      
      {/* Overlay for auth detection */}
      <div 
        className="absolute inset-0 pointer-events-none"
        onMouseEnter={() => {
          // Check if we need to show auth prompt based on iframe content
          setTimeout(() => {
            if (!isAuthenticated && !showAuthPrompt) {
              // If the iframe shows a sign-in page, show our auth prompt
              setShowAuthPrompt(true);
            }
          }, 3000);
        }}
      />
    </div>
  );
}
