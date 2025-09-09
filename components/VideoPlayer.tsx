"use client";

import { useState, useEffect, useCallback } from "react";

interface VideoPlayerProps {
  videoUrl: string;
  courseId?: string;
  title?: string;
}

export default function VideoPlayer({ videoUrl, courseId, title }: VideoPlayerProps) {
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'needs_auth' | 'error'>('checking');
  const [authError, setAuthError] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);

  const addDebugLog = (message: string) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log('VideoPlayer Debug:', logEntry);
    setDebugLogs(prev => [...prev, logEntry]);
  };

  const checkVideoAccess = useCallback(async () => {
    try {
      addDebugLog('Starting video access check...');
      setAuthStatus('checking');
      setAuthError(null);

      // Parse the SharePoint URL
      const urlInfo = parseSharePointUrl(videoUrl);
      addDebugLog(`Parsed URL info: ${JSON.stringify(urlInfo)}`);

      // Try a simple fetch to see if we can access the video
      const testResult = await testVideoAccess();

      if (testResult.success) {
        addDebugLog('Video access successful - can embed directly');
        setAuthStatus('authenticated');
        setVideoSrc(videoUrl);
      } else {
        addDebugLog(`Video access failed: ${testResult.error}`);
        setAuthStatus('needs_auth');
        setAuthError(testResult.error || 'Authentication required');
      }

    } catch (error) {
      addDebugLog(`Video access check failed: ${error}`);
      setAuthError(error instanceof Error ? error.message : 'Unknown error');
      setAuthStatus('needs_auth');
    }
  }, [videoUrl]); // Dependency array includes videoUrl

  useEffect(() => {
    if (!videoUrl) {
      addDebugLog('No video URL provided');
      setAuthError('No video URL provided');
      setAuthStatus('error');
      return;
    }

    addDebugLog(`Component mounted with videoUrl: ${videoUrl}`);
    checkVideoAccess();
  }, [videoUrl, checkVideoAccess]); // Added checkVideoAccess to dependencies

  const parseSharePointUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return {
        origin: urlObj.origin,
        hostname: urlObj.hostname,
        pathname: urlObj.pathname,
        search: urlObj.search,
        isSharePoint: urlObj.hostname.includes('.sharepoint.com'),
        tenantInfo: urlObj.hostname.split('.')[0]
      };
    } catch (error) {
      addDebugLog(`URL parsing failed: ${error}`);
      return null;
    }
  };

  const testVideoAccess = async (): Promise<{success: boolean, error?: string}> => {
    try {
      addDebugLog('Testing video access with proxy...');
      const response = await fetch('/api/video-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: videoUrl,
          userAgent: navigator.userAgent
        })
      });

      if (response.ok) {
        const data = await response.json();
        addDebugLog(`Proxy response: ${JSON.stringify(data)}`);

        if (data.success === true) {
          return { success: true };
        } else {
          return { success: false, error: data.error || 'Access denied' };
        }
      } else {
        const error = await response.text();
        addDebugLog(`Proxy request failed: ${response.status} - ${error}`);
        return { success: false, error: `Server error: ${error}` };
      }
    } catch (error) {
      addDebugLog(`Proxy request error: ${error}`);
      return { success: false, error: `Network error: ${error}` };
    }
  };

  const openSharePointAuth = () => {
    addDebugLog('Opening SharePoint authentication in new tab');

    // Open SharePoint in a new tab for authentication
    const authWindow = window.open(
      videoUrl,
      '_blank',
      'noopener,noreferrer'
    );

    if (!authWindow) {
      setAuthError('Popup blocked - please allow popups and try again');
      addDebugLog('Failed to open authentication tab - popup blocked');
    } else {
      addDebugLog('Authentication tab opened successfully');
      setAuthError('Please sign in to SharePoint in the new tab, then click "Try Again" below');
    }
  };

  const retryVideoAccess = () => {
    addDebugLog('Retrying video access...');
    setAttemptCount(prev => prev + 1);
    setDebugLogs([]);
  };

  const clearAndRetry = () => {
    addDebugLog('Clearing cache and retrying...');

    // Clear any cached authentication
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
    }

    setDebugLogs([]);
    setAttemptCount(prev => prev + 1);
  };

  if (authStatus === 'checking') {
    return (
      <div className="w-full max-w-4xl mx-auto bg-white rounded-lg shadow-sm border p-6">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600">Checking video access...</p>
          <div className="text-xs text-gray-500">
            {debugLogs.length > 0 && debugLogs[debugLogs.length - 1].split('] ')[1]}
          </div>
          <button
            onClick={() => setShowDebugLogs(!showDebugLogs)}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            {showDebugLogs ? 'Hide' : 'Show'} Debug Info
          </button>
        </div>

        {showDebugLogs && (
          <div className="mt-4 p-3 bg-gray-100 rounded text-xs font-mono max-h-40 overflow-y-auto">
            {debugLogs.map((log, index) => (
              <div key={index} className="mb-1">{log}</div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (authStatus === 'authenticated' && videoSrc) {
    return (
      <div className="w-full max-w-4xl mx-auto bg-white rounded-lg shadow-sm border p-6">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">
              {title || "Training Video"}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={openSharePointAuth}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                Open in New Tab
              </button>
              <button
                onClick={() => setShowDebugLogs(!showDebugLogs)}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Debug
              </button>
            </div>
          </div>

          <div className="aspect-video bg-black rounded">
            <iframe
              src={videoSrc}
              className="w-full h-full rounded"
              allowFullScreen
              allow="autoplay; fullscreen"
              title={title || "Training Video"}
              onLoad={() => {
                addDebugLog('Video iframe loaded successfully');
              }}
              onError={() => {
                addDebugLog('Video iframe failed to load');
                setAuthStatus('needs_auth');
                setAuthError('Video failed to load - authentication may have expired');
              }}
            />
          </div>

          <div className="text-xs text-green-600 bg-green-50 p-2 rounded">
            ✓ Video loaded successfully
          </div>
        </div>

        {showDebugLogs && (
          <div className="mt-4 p-3 bg-gray-100 rounded text-xs font-mono max-h-40 overflow-y-auto">
            <div className="text-green-600 font-bold mb-2">✓ Video Access Successful</div>
            {debugLogs.map((log, index) => (
              <div key={index} className="mb-1">{log}</div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Authentication needed
  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-lg shadow-sm border p-6">
      <div className="text-center space-y-6">
        <div className="text-blue-500">
          <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>

        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            SharePoint Authentication Required
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            This video requires Microsoft SharePoint authentication to view.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
          <h4 className="font-medium text-blue-900 text-sm mb-3">Quick Authentication Steps:</h4>
          <ol className="text-xs text-blue-800 space-y-2">
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <span>Click "Authenticate with SharePoint" to open a new tab</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <span>Sign in to Microsoft SharePoint in the new tab</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <span>Return to this page and click "Try Again"</span>
            </li>
          </ol>
        </div>

        <div className="space-y-3">
          <button
            onClick={openSharePointAuth}
            className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Authenticate with SharePoint
          </button>

          <button
            onClick={retryVideoAccess}
            className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Try Again
          </button>

          <button
            onClick={clearAndRetry}
            className="w-full text-sm text-gray-600 hover:text-gray-800 underline"
          >
            Clear Cache and Retry
          </button>

          <button
            onClick={() => setShowDebugLogs(!showDebugLogs)}
            className="w-full text-xs text-gray-500 hover:text-gray-700 underline"
          >
            {showDebugLogs ? 'Hide' : 'Show'} Debug Information
          </button>
        </div>

        {authError && (
          <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded">
            <p className="text-sm text-orange-800">{authError}</p>
          </div>
        )}

        {showDebugLogs && (
          <div className="mt-4 p-3 bg-gray-100 rounded text-xs font-mono max-h-60 overflow-y-auto text-left">
            <div className="text-orange-600 font-bold mb-2">🔐 Authentication Required</div>
            <div className="mb-2"><strong>Video URL:</strong> {videoUrl}</div>
            <div className="mb-2"><strong>Attempt:</strong> {attemptCount + 1}</div>
            <div className="mb-2"><strong>User Agent:</strong> {navigator.userAgent}</div>
            <div className="mb-2"><strong>Timestamp:</strong> {new Date().toISOString()}</div>
            <div className="border-t pt-2 mt-2">
              <div className="font-bold mb-1">Debug Logs:</div>
              {debugLogs.map((log, index) => (
                <div key={index} className="mb-1">{log}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}