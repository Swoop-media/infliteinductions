// Utility to detect mobile and tablet devices
export function isMobileOrTablet(): boolean {
  if (typeof window === 'undefined') return false;
  
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  
  // Check for mobile devices including tablets
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Windows Phone|Kindle|Silk|Mobile/i;
  
  // Also check for tablets specifically
  const tabletRegex = /iPad|Android(?!.*Mobile)|Tablet|tablet|PlayBook|Silk/i;
  
  // Check screen size as additional validation (tablets and phones typically under 1024px)
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  return mobileRegex.test(userAgent) || tabletRegex.test(userAgent) || isTouchDevice;
}

// Check if device has camera capability
export function hasCamera(): boolean {
  if (typeof navigator === 'undefined') return false;
  
  // Most mobile devices have cameras
  if (isMobileOrTablet()) return true;
  
  // For desktop, check if media devices are available
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}