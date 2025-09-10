import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { filePath } = body;

    if (!filePath) {
      return NextResponse.json({ error: 'File path required' }, { status: 400 });
    }

    // Create cache directory for converted images
    const cacheDir = path.join(process.cwd(), 'public', 'powerpoint', encodeURIComponent(filePath));
    await fs.mkdir(cacheDir, { recursive: true });

    // Check if conversion already exists
    try {
      const files = await fs.readdir(cacheDir);
      const slides = files
        .filter(f => f.endsWith('.png'))
        .sort((a, b) => {
          const numA = parseInt(a.match(/slide-(\d+)/)?.[1] || '0');
          const numB = parseInt(b.match(/slide-(\d+)/)?.[1] || '0');
          return numA - numB;
        });

      if (slides.length > 0) {
        const slideUrls = slides.map(slide => `/powerpoint/${encodeURIComponent(filePath)}/${slide}`);
        return NextResponse.json({ 
          slides: slideUrls,
          totalSlides: slides.length,
          cached: true
        });
      }
    } catch (e) {
      // Directory doesn't exist or is empty, continue with conversion
    }

    // Use the conversion script
    const scriptPath = path.join(process.cwd(), 'scripts', 'convert_pptx.py');
    
    // Check if script exists
    try {
      await fs.access(scriptPath);
    } catch {
      return NextResponse.json(
        { error: 'PowerPoint conversion script not found' },
        { status: 500 }
      );
    }

    // Execute Python script
    try {
      const { stdout, stderr } = await execAsync(`python3 ${scriptPath} "${filePath}" "${cacheDir}"`);
      
      if (stdout.startsWith('ERROR:')) {
        throw new Error(stdout.substring(6));
      }

      // Get converted slides
      const files = await fs.readdir(cacheDir);
      const slides = files
        .filter(f => f.endsWith('.png'))
        .sort((a, b) => {
          const numA = parseInt(a.match(/slide-(\d+)/)?.[1] || '0');
          const numB = parseInt(b.match(/slide-(\d+)/)?.[1] || '0');
          return numA - numB;
        });

      const slideUrls = slides.map(slide => `/powerpoint/${encodeURIComponent(filePath)}/${slide}`);

      return NextResponse.json({ 
        slides: slideUrls,
        totalSlides: slides.length,
        cached: false
      });

    } catch (error) {
      throw error;
    }

  } catch (error: any) {
    console.error('PowerPoint conversion error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to convert PowerPoint' },
      { status: 500 }
    );
  }
}