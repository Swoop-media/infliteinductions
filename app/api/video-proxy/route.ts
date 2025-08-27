
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoUrl = searchParams.get('url');
    const courseId = searchParams.get('courseId');

    if (!videoUrl || !courseId) {
      return new NextResponse('Missing required parameters', { status: 400 });
    }

    // Get the authenticated user
    const supabase = await createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Check if user has access to this course
    const { data: assignment } = await supabase
      .from('course_assignments')
      .select('id')
      .eq('course_id', courseId)
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: enrolment } = await supabase
      .from('course_enrolments')
      .select('id')
      .eq('course_id', courseId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!assignment && !enrolment) {
      return new NextResponse('Access denied to this course', { status: 403 });
    }

    // For SharePoint videos, we'll create a simple HTML page that embeds the video
    // This leverages the user's existing browser session with Microsoft
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Course Video</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #f3f4f6;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .container {
            width: 100vw;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        iframe {
            width: 100%;
            height: 100%;
            border: none;
        }
        .loading {
            text-align: center;
            color: #6b7280;
        }
        .spinner {
            border: 2px solid #f3f4f6;
            border-top: 2px solid #2563eb;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .error {
            background: #fef2f2;
            border: 1px solid #fecaca;
            color: #dc2626;
            padding: 16px;
            border-radius: 8px;
            max-width: 400px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <div id="loading" class="loading">
            <div class="spinner"></div>
            <p>Loading video...</p>
        </div>
        <div id="error" class="error" style="display: none;">
            <p>Unable to load video. Please ensure you're signed in to Microsoft and have access to this content.</p>
            <button onclick="location.reload()">Retry</button>
        </div>
        <iframe id="video" src="${videoUrl}" style="display: none;" allowfullscreen></iframe>
    </div>

    <script>
        const iframe = document.getElementById('video');
        const loading = document.getElementById('loading');
        const error = document.getElementById('error');

        // Show video after a short delay
        setTimeout(() => {
            loading.style.display = 'none';
            iframe.style.display = 'block';
        }, 2000);

        // Handle iframe load errors
        iframe.onerror = () => {
            loading.style.display = 'none';
            iframe.style.display = 'none';
            error.style.display = 'block';
        };

        // Handle iframe load success
        iframe.onload = () => {
            loading.style.display = 'none';
            iframe.style.display = 'block';
        };
    </script>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (error) {
    console.error('Video proxy error:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
