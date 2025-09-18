// @ts-nocheck
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExternalLink, RefreshCw, AlertTriangle } from "lucide-react";

interface UnifiedVideoPlayerProps {
  videoUrl: string;
  courseId?: string;
  title?: string;
}

type VideoSource = "sharepoint" | "youtube" | "vimeo" | "stream" | "other";

export default function UnifiedVideoPlayer({ videoUrl, courseId, title }: UnifiedVideoPlayerProps) {
  const [embedUrl, setEmbedUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [useProxy, setUseProxy] = useState(false);

  // Extract URL from iframe HTML if provided
  const extractUrl = useCallback((input: string): string => {
    if (input.includes("<iframe")) {
      const srcMatch = input.match(/src=["']([^"']+)["']/);
      if (srcMatch) {
        return srcMatch[1];
      }
    }
    return input;
  }, []);

  // Detect video source type
  const detectVideoSource = useCallback((url: string): VideoSource => {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();

      if (hostname.includes("sharepoint.com") || hostname.includes("onedrive")) {
        return "sharepoint";
      }
      if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
        return "youtube";
      }
      if (hostname.includes("vimeo.com")) {
        return "vimeo";
      }
      if (hostname.includes("stream.microsoft.com") || hostname.includes("microsoftstream.com")) {
        return "stream";
      }
      return "other";
    } catch {
      return "other";
    }
  }, []);

  // Convert URLs to embeddable format
  const normalizeVideoUrl = useCallback((url: string): string => {
    const cleanUrl = extractUrl(url);

    try {
      const parsedUrl = new URL(cleanUrl);
      const hostname = parsedUrl.hostname.replace(/^www\./, "");

      // YouTube normalization
      if (hostname === "youtube.com" || hostname === "m.youtube.com") {
        if (parsedUrl.pathname === "/watch") {
          const videoId = parsedUrl.searchParams.get("v");
          if (videoId) {
            return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
          }
        } else if (parsedUrl.pathname.startsWith("/shorts/")) {
          const videoId = parsedUrl.pathname.split("/")[2];
          if (videoId) {
            return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
          }
        } else if (parsedUrl.pathname.startsWith("/embed/")) {
          // Already an embed URL
          return cleanUrl;
        }
      } else if (hostname === "youtu.be") {
        const videoId = parsedUrl.pathname.slice(1).split("/")[0];
        if (videoId) {
          return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
        }
      }

      // Vimeo normalization
      if (hostname === "vimeo.com") {
        if (parsedUrl.pathname.startsWith("/video/")) {
          // Already an embed URL
          return cleanUrl;
        } else {
          const videoId = parsedUrl.pathname.split("/").filter(Boolean)[0];
          if (videoId && /^\d+$/.test(videoId)) {
            return `https://player.vimeo.com/video/${videoId}`;
          }
        }
      }

      // SharePoint/OneDrive - check if it's already an embed URL
      if (hostname.includes("sharepoint.com") || hostname.includes("onedrive")) {
        if (parsedUrl.pathname.includes("/_layouts/15/embed.aspx")) {
          // Already an embed URL, ensure parent parameter is set
          const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
          if (currentOrigin) {
            parsedUrl.searchParams.set("parent", currentOrigin);
          }
          return parsedUrl.toString();
        }
        // For non-embed SharePoint URLs, we'll need to handle authentication
        return cleanUrl;
      }

      // Microsoft Stream
      if (hostname.includes("stream.microsoft.com") || hostname.includes("microsoftstream.com")) {
        // Stream URLs usually work directly in iframes if authenticated
        return cleanUrl;
      }

      // Default: return as-is
      return cleanUrl;
    } catch {
      return cleanUrl;
    }
  }, [extractUrl]);

  // Handle SharePoint authentication and get authenticated URL
  const getAuthenticatedSharePointUrl = useCallback(async (url: string): Promise<string> => {
    try {
      const response = await fetch("/api/video-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, courseId })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to authenticate" }));
        throw new Error(errorData.error || "Authentication failed");
      }

      const data = await response.json();
      if (data.embedUrl) {
        return data.embedUrl;
      } else if (data.proxyUrl) {
        // Use proxy URL for authenticated access
        setUseProxy(true);
        return data.proxyUrl;
      } else {
        throw new Error("No authenticated URL received");
      }
    } catch (error: any) {
      console.error("SharePoint authentication error:", error);
      throw error;
    }
  }, [courseId]);

  // Main initialization effect
  useEffect(() => {
    const initializeVideo = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const cleanUrl = extractUrl(videoUrl);
        const videoSource = detectVideoSource(cleanUrl);

        let finalUrl = normalizeVideoUrl(cleanUrl);

        // Handle SharePoint/Stream authentication
        if (videoSource === "sharepoint" || videoSource === "stream") {
          try {
            finalUrl = await getAuthenticatedSharePointUrl(finalUrl);
          } catch (authError: any) {
            console.warn("Authentication attempt failed, trying direct embed:", authError);
            // Fall back to direct embed, user might already be authenticated
          }
        }

        setEmbedUrl(finalUrl);
      } catch (error: any) {
        console.error("Video initialization error:", error);
        setError(error.message || "Failed to load video");
      } finally {
        setIsLoading(false);
      }
    };

    initializeVideo();
  }, [videoUrl, retryCount, extractUrl, detectVideoSource, normalizeVideoUrl, getAuthenticatedSharePointUrl]);

  // Handle iframe load events
  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);

  const handleIframeError = useCallback(() => {
    const videoSource = detectVideoSource(embedUrl);
    
    if (videoSource === "sharepoint" || videoSource === "stream") {
      setError("Video requires authentication. Click 'Open in New Tab' to sign in, then return here and click 'Retry'.");
    } else {
      setError("Failed to load video. The video might be private or the URL might be incorrect.");
    }
    setIsLoading(false);
  }, [embedUrl, detectVideoSource]);

  // Retry loading
  const handleRetry = useCallback(() => {
    setRetryCount((prev) => prev + 1);
    setError(null);
  }, []);

  // Open in new tab
  const openInNewTab = useCallback(() => {
    const urlToOpen = extractUrl(videoUrl);
    window.open(urlToOpen, "_blank", "noopener,noreferrer");
  }, [videoUrl, extractUrl]);

  const videoSource = useMemo(() => detectVideoSource(embedUrl), [embedUrl, detectVideoSource]);

  return (
    <div className="w-full">
      <div className="relative bg-black rounded-lg overflow-hidden" style={{ paddingBottom: "56.25%" }}>
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <Card className="max-w-md mx-4 p-6">
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Unable to Load Video</p>
                    <p className="text-sm text-gray-600">{error}</p>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <Button
                    onClick={openInNewTab}
                    variant="default"
                    size="sm"
                    className="flex items-center space-x-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Open in New Tab</span>
                  </Button>
                  
                  {(videoSource === "sharepoint" || videoSource === "stream") && (
                    <Button
                      onClick={handleRetry}
                      variant="outline"
                      size="sm"
                      className="flex items-center space-x-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Retry</span>
                    </Button>
                  )}
                </div>

                {videoSource === "sharepoint" && (
                  <div className="text-xs text-gray-500 pt-2 border-t">
                    <p className="font-medium mb-1">Instructions:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Click "Open in New Tab" above</li>
                      <li>Sign in with your Microsoft account if prompted</li>
                      <li>Once the video loads, return to this page</li>
                      <li>Click "Retry" to load the video here</li>
                    </ol>
                  </div>
                )}
              </div>
            </Card>
          </div>
        ) : (
          <>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                <div className="text-center space-y-3">
                  <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-white text-sm">Loading video...</p>
                </div>
              </div>
            )}
            
            <iframe
              src={embedUrl}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              title={title || "Course video"}
            />
          </>
        )}
      </div>

      {/* Optional: Show current video source for debugging */}
      {process.env.NODE_ENV === "development" && (
        <div className="mt-2 text-xs text-gray-500">
          Video source: {videoSource} | Proxy: {useProxy ? "Yes" : "No"}
        </div>
      )}
    </div>
  );
}