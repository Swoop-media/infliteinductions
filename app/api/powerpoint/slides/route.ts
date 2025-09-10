import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import path from 'path';
import fs from 'fs/promises';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the slide path from query parameters
    const searchParams = request.nextUrl.searchParams;
    const presentationId = searchParams.get('presentation');
    const slideNumber = searchParams.get('slide');

    if (!presentationId || !slideNumber) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Validate inputs to prevent path traversal
    if (presentationId.includes('..') || presentationId.includes('/') || presentationId.includes('\\')) {
      return NextResponse.json({ error: 'Invalid presentation ID' }, { status: 400 });
    }

    if (!/^\d+$/.test(slideNumber)) {
      return NextResponse.json({ error: 'Invalid slide number' }, { status: 400 });
    }

    // Build the path to the slide (now stored in a private cache directory)
    const cacheDir = path.join(process.cwd(), '.slides_cache', presentationId);
    const slideFileName = `slide-${slideNumber.padStart(3, '0')}.png`;
    const slidePath = path.join(cacheDir, slideFileName);

    try {
      // Check if the slide file exists
      await fs.access(slidePath);
      
      // Read the slide file
      const slideBuffer = await fs.readFile(slidePath);
      
      // Return the image with proper headers
      return new NextResponse(slideBuffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'private, max-age=3600', // Cache for 1 hour
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch (error) {
      return NextResponse.json({ error: 'Slide not found' }, { status: 404 });
    }
  } catch (error: any) {
    console.error('Error serving slide:', error);
    return NextResponse.json(
      { error: 'Failed to serve slide' },
      { status: 500 }
    );
  }
}