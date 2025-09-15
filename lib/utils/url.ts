// lib/utils/url.ts
/**
 * Get the base URL for the application, prioritizing production domain
 * Falls back through environment variables in order of preference
 */
export function getBaseUrl(): string {
  // 1. Explicit site URL (production)
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, ''); // Remove trailing slash
  }
  
  // 2. Replit deployed app domain
  if (process.env.REPLIT_DOMAINS) {
    const domain = process.env.REPLIT_DOMAINS.split(',')[0];
    return `https://${domain}`;
  }
  
  // 3. Fallback to localhost for development
  return 'http://localhost:3000';
}

/**
 * Convert a relative or absolute URL to an absolute URL using the production domain
 * For absolute URLs, replaces the host with the production domain
 */
export function toAbsoluteUrl(urlOrPath: string): string {
  // Handle non-http schemes (mailto:, tel:, etc.) - return as-is
  if (urlOrPath.includes(':') && !urlOrPath.startsWith('http://') && !urlOrPath.startsWith('https://')) {
    return urlOrPath;
  }
  
  // If already absolute HTTP/HTTPS URL, replace the origin with production domain
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    try {
      const url = new URL(urlOrPath);
      const productionUrl = new URL(getBaseUrl());
      url.protocol = productionUrl.protocol;
      url.host = productionUrl.host;
      return url.toString();
    } catch (e) {
      // If URL parsing fails, fall back to original behavior
      return urlOrPath;
    }
  }
  
  // If relative path, prepend base URL
  if (urlOrPath.startsWith('/')) {
    return getBaseUrl() + urlOrPath;
  }
  
  // If no leading slash, assume it's a relative path
  return getBaseUrl() + '/' + urlOrPath;
}

/**
 * Create an absolute URL for a course
 */
export function getCourseUrl(courseId: string): string {
  return toAbsoluteUrl(`/app/learn/courses/${courseId}`);
}

/**
 * Create an absolute URL for a course creator page
 */
export function getCreatorCourseUrl(courseId: string): string {
  return toAbsoluteUrl(`/app/creator/courses/${courseId}`);
}

/**
 * Create an absolute URL for reviewing an assignment
 */
export function getReviewUrl(assignmentId: string): string {
  return toAbsoluteUrl(`/app/admin/review/${assignmentId}`);
}