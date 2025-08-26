
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
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Check if user is already authenticated for this course's SharePoint
    const authKey = `sharepoint_auth_${courseId}`;
    const isAlreadyAuthed = localStorage.getItem(authKey) === 'true';
    
    if (isAlreadyAuthed) {
      setIsAuthenticated(true);
      setIsLoading(false);
    } else {
      // Try to load the iframe and detect if authentication is needed
      checkAuthenticationStatus();
    }
  }, [courseId]);

  const checkAuthenticationStatus = () => {
    setIsLoading(true);
    setAuthError(null);

    // Create a hidden iframe to test access
    const testFrame = document.createElement('iframe');
    testFrame.style.display = 'none';
    testFrame.src = url;
    
    const timeout = setTimeout(() => {
      document.body.removeChild(testFrame);
      setAuthError('Unable to load video. Authentication may be required.');
      setIsLoading(false);
    }, 10000);

    testFrame.onload = () => {
      clearTimeout(timeout);
      try {
        // If we can access the iframe content, we're authenticated
        const authKey = `sharepoint_auth_${courseId}`;
        localStorage.setItem(authKey, 'true');
        setIsAuthenticated(true);
        document.body.removeChild(testFrame);
      } catch (e) {
        // Cross-origin error means we might need authentication
        setAuthError('Video requires authentication');
      }
      setIsLoading(false);
    };

    testFrame.onerror = () => {
      clearTimeout(timeout);
      setAuthError('Failed to load video');
      setIsLoading(false);
      document.body.removeChild(testFrame);
    };

    document.body.appendChild(testFrame);
  };

  const handleAuthenticate = () => {
    // Open SharePoint URL in a new window for authentication
    const authWindow = window.open(
      url,
      'sharepoint_auth',
      'width=800,height=600,scrollbars=yes,resizable=yes'
    );

    // Monitor the auth window
    const checkAuth = setInterval(() => {
      try {
        if (authWindow?.closed) {
          clearInterval(checkAuth);
          // Recheck authentication after window closes
          setTimeout(() => {
            checkAuthenticationStatus();
          }, 1000);
        }
      } catch (e) {
        // Handle cross-origin errors
      }
    }, 1000);

    // Clear interval after 5 minutes
    setTimeout(() => {
      clearInterval(checkAuth);
      if (authWindow && !authWindow.closed) {
        authWindow.close();
      }
    }, 300000);
  };

  const handleIframeLoad = () => {
    // Set authentication as successful when iframe loads successfully
    const authKey = `sharepoint_auth_${courseId}`;
    localStorage.setItem(authKey, 'true');
    setIsAuthenticated(true);
    setAuthError(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">Loading video...</p>
        </div>
      </div>
    );
  }

  if (authError && !isAuthenticated) {
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
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg className="w-4 h-4 mr-2" viewBox="0 0 23 23" fill="currentColor">
              <path d="M11.03 0H0v11.03h11.03V0z"/>
              <path d="M23 0H11.97v11.03H23V0z"/>
              <path d="M11.03 11.97H0V23h11.03V11.97z"/>
              <path d="M23 11.97H11.97V23H23V11.97z"/>
            </svg>
            Sign in to view video
          </button>
          <p className="text-xs text-gray-500 mt-2">
            A new window will open for authentication
          </p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      src={url}
      className="h-full w-full"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      referrerPolicy="no-referrer-when-downgrade"
      onLoad={handleIframeLoad}
      onError={() => setAuthError('Failed to load video')}
    />
  );
}
