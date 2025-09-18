# Video Player System Documentation

## Overview
The INFLITE LMS uses a unified video player component that can handle multiple video sources including YouTube, Vimeo, SharePoint, Microsoft Stream, and direct video URLs. This document explains how the system works and how to maintain it.

## Architecture

### Main Component
**Location**: `components/UnifiedVideoPlayer.tsx`

The UnifiedVideoPlayer is a React component that:
1. Detects the video source from the URL
2. Converts URLs to embeddable formats
3. Handles authentication for SharePoint/Stream videos
4. Provides fallback options when videos fail to load

### Video Sources Supported
- **YouTube**: Regular YouTube videos and YouTube Shorts
- **Vimeo**: Standard Vimeo videos
- **SharePoint**: Videos hosted in SharePoint/OneDrive
- **Microsoft Stream**: Corporate training videos
- **Direct URLs**: MP4, WebM, and other video files

## How It Works

### 1. Video Source Detection
The component examines the URL to determine the video platform:
```typescript
- YouTube: Contains 'youtube.com' or 'youtu.be'
- Vimeo: Contains 'vimeo.com'
- SharePoint: Contains 'sharepoint.com' or '.sharepoint.'
- Stream: Contains 'microsoftstream.com' or 'web.microsoftstream.com'
- Direct: Ends with video extensions (.mp4, .webm, etc.)
```

### 2. URL Normalization
Each platform requires specific embed URL formats:
- **YouTube**: Converts to `https://www.youtube.com/embed/{videoId}`
- **Vimeo**: Converts to `https://player.vimeo.com/video/{videoId}`
- **SharePoint**: Uses the original URL with added parameters
- **Direct**: Uses the URL as-is

### 3. SharePoint Authentication Flow

SharePoint videos require special handling due to authentication:

1. **Initial Load Attempt**: The video tries to load directly in an iframe
2. **Authentication Required**: If the user isn't authenticated, an error is shown
3. **User Action**: User clicks "Sign In to SharePoint" which opens the video in a new tab
4. **Browser Authentication**: User signs in to Microsoft/SharePoint in the new tab
5. **Return and Retry**: User returns to the app and clicks "Retry"
6. **Authenticated Load**: The iframe now loads with the user's authenticated session

**Why This Approach?**
- Avoids requiring admin consent for advanced SharePoint API permissions
- Uses the browser's native authentication session
- Works reliably across different SharePoint configurations
- Simple for users to understand

### 4. Error Handling
The component provides clear error messages and recovery options:
- Shows specific instructions for SharePoint authentication
- Includes retry mechanism for temporary failures
- Displays context-specific error messages based on video source

### 5. Always-Available Controls
The component includes an "Open in New Tab" button that is always visible below the video player, allowing users to:
- View videos directly in their source platform
- Authenticate with SharePoint/Stream when needed
- Access videos that may have embedding restrictions
- Prefer watching in the native platform interface

## Authentication Configuration

### Microsoft Azure AD Setup
**Location**: `lib/auth/microsoft.ts`

The app uses Microsoft OAuth with basic scopes:
```javascript
scopes: ["openid", "profile", "email", "User.Read"]
```

**Important**: Do NOT add SharePoint-specific scopes like `Files.Read.All` or `Sites.Read.All` as these require admin consent and will block all users from logging in.

### Authentication Flow
1. User logs in via Microsoft OAuth
2. Basic profile information is retrieved
3. SharePoint videos use the browser's existing Microsoft session
4. No additional tokens or permissions needed

## API Endpoints

### `/api/video-auth/route.ts`
Currently a placeholder that could be extended for future proxy-based authentication if needed.

## Usage in Pages

The UnifiedVideoPlayer is used throughout the application:

### Course Pages
**Location**: `app/app/learn/courses/[id]/page.tsx`
```jsx
<UnifiedVideoPlayer 
  videoUrl={block.content}
  courseId={params.id}
  title={block.title}
/>
```

### Module Pages
**Location**: `app/app/learn/modules/[id]/page.tsx`
```jsx
<UnifiedVideoPlayer 
  videoUrl={block.content}
  courseId={moduleData.course_id}
  title={block.title}
/>
```

### Contractor Views
**Location**: `app/app/contractors/course/[courseId]/_components/ContractorModuleRenderer.tsx`

## Common Issues and Solutions

### Issue: "Need admin approval" error when logging in
**Cause**: SharePoint API scopes were added that require admin consent
**Solution**: Remove advanced scopes from `lib/auth/microsoft.ts` and keep only basic scopes

### Issue: SharePoint video won't load
**Cause**: User not authenticated with SharePoint
**Solution**: 
1. Click either "Open in New Tab" or "Sign In to SharePoint" button (both work)
2. Authenticate with Microsoft/SharePoint in the new tab
3. Return to the app and click "Retry"
4. The video should now load with your authenticated session

**Note**: Both buttons trigger the authentication flag and enable the cache-buster on retry, ensuring the authenticated session is used.

### Issue: Video shows blank or loads indefinitely
**Possible Causes**:
- Incorrect URL format
- Video is private or deleted
- Network connectivity issues
**Solution**: Use "Open in New Tab" to verify the video works directly

## Development Guidelines

### Adding New Video Platforms
1. Add detection logic in `detectVideoSource()`
2. Add URL normalization in `normalizeVideoUrl()`
3. Test embed parameters and permissions
4. Update this documentation

### Testing Video Players
1. Test with authenticated and unauthenticated sessions
2. Verify each platform's embed works
3. Test error states and recovery flows
4. Check mobile responsiveness

### Security Considerations
- Never expose authentication tokens in client-side code
- Use iframe sandboxing appropriately
- Validate all video URLs before embedding
- Consider Content Security Policy (CSP) headers

## Browser Compatibility
The video player works on:
- Chrome/Edge (recommended)
- Firefox
- Safari (may have autoplay restrictions)
- Mobile browsers (iOS/Android)

## Future Improvements
Potential enhancements for consideration:
1. Server-side proxy for SharePoint videos (requires admin consent)
2. Video analytics and watch tracking
3. Offline video caching
4. Custom video player controls
5. Subtitle/caption support

## Maintenance Notes
- Keep Microsoft OAuth scopes minimal to avoid admin consent requirements
- Test SharePoint integration after any authentication changes
- Monitor browser console for CORS or embedding errors
- Update this documentation when making significant changes