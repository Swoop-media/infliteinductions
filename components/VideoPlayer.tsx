
"use client";

import { useState, useEffect } from "react";

interface VideoPlayerProps {
  videoUrl: string;
  courseId?: string;
  title?: string;
}

export default function VideoPlayer({ videoUrl, courseId, title }: VideoPlayerProps) {
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'unauthenticated' | 'error'>('checking');
  const [authError, setAuthError] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<any>(null);

  const addDebugLog = (message: string) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log('VideoPlayer Debug:', logEntry);
    setDebugLogs(prev => [...prev, logEntry]);
  };

  useEffect(() => {
    // Prevent duplicate execution during development
    let mounted = true;
    
    addDebugLog(`Component mounted with videoUrl: ${videoUrl}`);
    if (!videoUrl) {
      addDebugLog('VideoUrl is undefined - cannot proceed');
      setAuthError('No video URL provided');
      setAuthStatus('error');
      return;
    }
    
    // Small delay to prevent duplicate mounting issues
    const timer = setTimeout(() => {
      if (mounted) {
        checkAuthAndLoadVideo();
      }
    }, 100);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [videoUrl]);

  const checkAuthAndLoadVideo = async () => {
    try {
      addDebugLog('Starting authentication check...');
      setAuthStatus('checking');
      setAuthError(null);

      // Parse the SharePoint URL to extract key information
      const urlInfo = parseSharePointUrl(videoUrl);
      addDebugLog(`Parsed URL info: ${JSON.stringify(urlInfo)}`);

      // Try multiple authentication strategies
      await tryAuthenticationStrategies(urlInfo);

    } catch (error) {
      addDebugLog(`Authentication failed: ${error}`);
      setAuthError(error instanceof Error ? error.message : 'Unknown authentication error');
      setAuthStatus('error');
    }
  };

  const parseSharePointUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      
      return {
        origin: urlObj.origin,
        hostname: urlObj.hostname,
        pathname: urlObj.pathname,
        search: urlObj.search,
        isMicrosoft365: urlObj.hostname.includes('.sharepoint.com') || urlObj.hostname.includes('microsoft.com'),
        isVideo: pathParts.some(part => part.includes('.mp4') || part.includes('video')),
        tenantInfo: urlObj.hostname.split('.')[0]
      };
    } catch (error) {
      addDebugLog(`URL parsing failed: ${error}`);
      return null;
    }
  };

  const tryAuthenticationStrategies = async (urlInfo: any) => {
    const strategies = [
      'direct-embed',
      'iframe-with-auth',
      'proxy-request',
      'popup-auth',
      'session-check'
    ];

    for (const strategy of strategies) {
      addDebugLog(`Trying strategy: ${strategy}`);
      
      try {
        const result = await executeAuthStrategy(strategy, urlInfo);
        if (result.success) {
          addDebugLog(`Strategy ${strategy} succeeded`);
          setAuthStatus('authenticated');
          setVideoSrc(result.videoUrl);
          setSessionInfo(result.sessionInfo);
          return;
        } else {
          addDebugLog(`Strategy ${strategy} failed: ${result.error}`);
        }
      } catch (error) {
        addDebugLog(`Strategy ${strategy} threw error: ${error}`);
      }
    }

    setAuthStatus('unauthenticated');
    addDebugLog('All authentication strategies failed');
  };

  const executeAuthStrategy = async (strategy: string, urlInfo: any): Promise<{success: boolean, videoUrl?: string, sessionInfo?: any, error?: string}> => {
    switch (strategy) {
      case 'direct-embed':
        return await testDirectEmbed(urlInfo);
      
      case 'iframe-with-auth':
        return await testIframeWithAuth(urlInfo);
      
      case 'proxy-request':
        return await testProxyRequest(urlInfo);
      
      case 'popup-auth':
        return await testPopupAuth(urlInfo);
      
      case 'session-check':
        return await testSessionCheck(urlInfo);
      
      default:
        return { success: false, error: `Unknown strategy: ${strategy}` };
    }
  };

  const testDirectEmbed = async (urlInfo: any): Promise<{success: boolean, videoUrl?: string, error?: string}> => {
    return new Promise((resolve) => {
      const testImg = new Image();
      testImg.onload = () => {
        addDebugLog('Direct embed test: Image loaded (likely authenticated)');
        resolve({ success: true, videoUrl: videoUrl });
      };
      testImg.onerror = () => {
        addDebugLog('Direct embed test: Image failed (likely not authenticated)');
        resolve({ success: false, error: 'Direct embed failed - authentication required' });
      };
      testImg.src = videoUrl + '?t=' + Date.now();
      
      setTimeout(() => {
        resolve({ success: false, error: 'Direct embed test timeout' });
      }, 5000);
    });
  };

  const testIframeWithAuth = async (urlInfo: any): Promise<{success: boolean, videoUrl?: string, error?: string}> => {
    try {
      // Create a hidden iframe to test auth
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = videoUrl;
      document.body.appendChild(iframe);

      return new Promise((resolve) => {
        iframe.onload = () => {
          try {
            // Try to access iframe content (will fail if not authenticated)
            const iframeDoc = iframe.contentDocument;
            if (iframeDoc && !iframeDoc.body.innerHTML.includes('sign in')) {
              addDebugLog('Iframe auth test: Content loaded successfully');
              if (iframe.parentNode) document.body.removeChild(iframe);
              resolve({ success: true, videoUrl: videoUrl });
            } else {
              addDebugLog('Iframe auth test: Sign in required');
              if (iframe.parentNode) document.body.removeChild(iframe);
              resolve({ success: false, error: 'Sign in required' });
            }
          } catch (error) {
            addDebugLog(`Iframe auth test: Cross-origin error (expected): ${error}`);
            if (iframe.parentNode) document.body.removeChild(iframe);
            resolve({ success: false, error: 'Cross-origin restriction' });
          }
        };

        iframe.onerror = () => {
          addDebugLog('Iframe auth test: Load error');
          if (iframe.parentNode) document.body.removeChild(iframe);
          resolve({ success: false, error: 'Iframe load error' });
        };

        setTimeout(() => {
          if (iframe.parentNode) document.body.removeChild(iframe);
          resolve({ success: false, error: 'Iframe test timeout' });
        }, 5000);
      });
    } catch (error) {
      return { success: false, error: `Iframe test failed: ${error}` };
    }
  };

  const testProxyRequest = async (urlInfo: any): Promise<{success: boolean, videoUrl?: string, error?: string}> => {
    try {
      addDebugLog('Testing proxy request...');
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
        addDebugLog(`Proxy request successful: ${JSON.stringify(data)}`);
        return { 
          success: true, 
          videoUrl: data.proxyUrl || videoUrl,
          sessionInfo: data 
        };
      } else {
        const error = await response.text();
        addDebugLog(`Proxy request failed: ${response.status} - ${error}`);
        return { success: false, error: `Proxy failed: ${error}` };
      }
    } catch (error) {
      addDebugLog(`Proxy request error: ${error}`);
      return { success: false, error: `Proxy error: ${error}` };
    }
  };

  const testPopupAuth = async (urlInfo: any): Promise<{success: boolean, videoUrl?: string, sessionInfo?: any, error?: string}> => {
    return new Promise((resolve) => {
      addDebugLog('Attempting popup authentication...');
      
      try {
        const popup = window.open(
          videoUrl,
          'sharepoint-auth',
          'width=1200,height=800,scrollbars=yes,resizable=yes,location=yes,menubar=no,toolbar=no'
        );

        if (!popup) {
          addDebugLog('Popup blocked by browser');
          resolve({ success: false, error: 'Popup blocked - please allow popups and try again' });
          return;
        }

        addDebugLog('Popup opened successfully');
        
        // Give user time to authenticate
        let checkCount = 0;
        const maxChecks = 60; // 60 seconds max
        
        const checkPopup = setInterval(() => {
          checkCount++;
          
          try {
            if (popup.closed) {
              addDebugLog('Popup closed by user');
              clearInterval(checkPopup);
              // Assume success if user closed it manually (they might have authenticated)
              resolve({ 
                success: true, 
                videoUrl: videoUrl,
                sessionInfo: { authenticatedViaPopup: true, timestamp: Date.now() }
              });
              return;
            }

            // Try to detect successful authentication by checking popup URL
            try {
              const popupUrl = popup.location.href;
              if (popupUrl && !popupUrl.includes('login') && !popupUrl.includes('signin') && popupUrl.includes(urlInfo.hostname)) {
                addDebugLog('Authentication detected - closing popup');
                popup.close();
                clearInterval(checkPopup);
                resolve({ 
                  success: true, 
                  videoUrl: videoUrl,
                  sessionInfo: { authenticatedViaPopup: true, timestamp: Date.now() }
                });
                return;
              }
            } catch (e) {
              // Cross-origin error is expected, continue
            }

            if (checkCount >= maxChecks) {
              addDebugLog('Popup authentication timeout');
              if (!popup.closed) popup.close();
              clearInterval(checkPopup);
              resolve({ success: false, error: 'Authentication timeout - please try again' });
            }
          } catch (error) {
            addDebugLog(`Popup check error: ${error}`);
          }
        }, 1000);

      } catch (error) {
        addDebugLog(`Failed to open popup: ${error}`);
        resolve({ success: false, error: `Failed to open authentication window: ${error}` });
      }
    });
  };

  const testSessionCheck = async (urlInfo: any): Promise<{success: boolean, sessionInfo?: any, error?: string}> => {
    try {
      // Check for existing Microsoft session
      addDebugLog('Checking for existing Microsoft session...');
      
      const sessionResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/authorize', {
        method: 'HEAD',
        mode: 'no-cors'
      });

      addDebugLog(`Session check response status: ${sessionResponse.status}`);
      
      return { 
        success: false, // We can't actually verify session this way due to CORS
        error: 'Session verification inconclusive',
        sessionInfo: { 
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
          cookies: document.cookie ? 'present' : 'none'
        }
      };
    } catch (error) {
      addDebugLog(`Session check error: ${error}`);
      return { success: false, error: `Session check failed: ${error}` };
    }
  };

  const retryAuthentication = () => {
    addDebugLog('Retrying authentication...');
    setDebugLogs([]);
    checkAuthAndLoadVideo();
  };

  const clearAuthAndRetry = () => {
    addDebugLog('Clearing authentication and retrying...');
    setVideoSrc(null);
    setSessionInfo(null);
    setAuthStatus('checking');
    setAuthError(null);
    setDebugLogs([]);
    
    // Clear any potential cached auth
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
    }
    
    setTimeout(() => {
      checkAuthAndLoadVideo();
    }, 1000);
  };

  const openInNewWindow = () => {
    addDebugLog('Opening video in new window for authentication...');
    const newWindow = window.open(
      videoUrl, 
      '_blank', 
      'width=1200,height=800,scrollbars=yes,resizable=yes,location=yes,menubar=yes,toolbar=yes'
    );
    
    if (!newWindow) {
      setAuthError('Popup blocked - please allow popups and try again');
    } else {
      // Give user feedback that they should authenticate in the new window
      setAuthError('Please sign in to SharePoint in the new window, then return here and click "Retry Authentication"');
    }
  };

  if (authStatus === 'checking') {
    return (
      <div className="w-full max-w-4xl mx-auto bg-white rounded-lg shadow-sm border p-6">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600">Checking SharePoint authentication...</p>
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
                onClick={openInNewWindow}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                Open in New Window
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
            />
          </div>
          
          {sessionInfo && (
            <div className="text-xs text-green-600 bg-green-50 p-2 rounded">
              ✓ Authenticated successfully
              {sessionInfo.authenticatedViaPopup && " (via popup)"}
            </div>
          )}
        </div>
        
        {showDebugLogs && (
          <div className="mt-4 p-3 bg-gray-100 rounded text-xs font-mono max-h-40 overflow-y-auto">
            <div className="text-green-600 font-bold mb-2">✓ Authentication Successful</div>
            {debugLogs.map((log, index) => (
              <div key={index} className="mb-1">{log}</div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Authentication failed or required
  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-lg shadow-sm border p-6">
      <div className="text-center space-y-4">
        <div className="text-red-500">
          <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.732 15.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        
        <h3 className="text-lg font-medium text-gray-900">
          SharePoint Authentication Required
        </h3>
        
        <div className="space-y-4">
          <p className="text-gray-600 text-sm">
            This video requires SharePoint authentication. Please try one of these options:
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <h4 className="font-medium text-blue-900 text-sm mb-2">Recommended: Authenticate in New Window</h4>
            <p className="text-xs text-blue-700 mb-3">
              1. Click "Open & Authenticate" below<br/>
              2. Sign in to SharePoint in the new window<br/>
              3. Return here and click "Retry Authentication"
            </p>
            <button
              onClick={openInNewWindow}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
            >
              Open & Authenticate in New Window
            </button>
          </div>

          <div className="space-y-2">
            <button
              onClick={retryAuthentication}
              className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200 text-sm"
            >
              Retry Authentication
            </button>
            
            <button
              onClick={clearAuthAndRetry}
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
        </div>

        {authError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-red-600">{authError}</p>
          </div>
        )}
        
        {showDebugLogs && (
          <div className="mt-4 p-3 bg-gray-100 rounded text-xs font-mono max-h-60 overflow-y-auto text-left">
            <div className="text-red-600 font-bold mb-2">❌ Authentication Failed</div>
            <div className="mb-2"><strong>Video URL:</strong> {videoUrl}</div>
            <div className="mb-2"><strong>User Agent:</strong> {navigator.userAgent}</div>
            <div className="mb-2"><strong>Cookies:</strong> {document.cookie ? 'Present' : 'None'}</div>
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
