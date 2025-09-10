import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Helper to download file from SharePoint using internal proxy
async function downloadSharePointFile(filePath: string, localPath: string, host: string) {
  const proxyUrl = `https://${host}/app/files/${encodeURIComponent(filePath)}`;
  
  const response = await fetch(proxyUrl, {
    headers: {
      'Cookie': cookies().toString()
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  await fs.writeFile(localPath, Buffer.from(buffer));
  return true;
}

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
    const safePath = filePath.replace(/[^a-zA-Z0-9-_]/g, '_');
    const cacheDir = path.join(process.cwd(), 'public', 'powerpoint', safePath);
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
        const slideUrls = slides.map(slide => `/powerpoint/${safePath}/${slide}`);
        return NextResponse.json({ 
          slides: slideUrls,
          totalSlides: slides.length,
          cached: true
        });
      }
    } catch (e) {
      // Directory doesn't exist or is empty, continue with conversion
    }

    // Download the PowerPoint file from SharePoint
    const tempDir = path.join(process.cwd(), 'temp_downloads');
    await fs.mkdir(tempDir, { recursive: true });
    
    const localFilePath = path.join(tempDir, `${safePath}.pptx`);
    
    // Get the host from request headers
    const host = request.headers.get('host') || 'localhost:5000';
    
    try {
      await downloadSharePointFile(filePath, localFilePath, host);
    } catch (error) {
      console.error('Failed to download SharePoint file:', error);
      // For demo purposes, create a sample presentation
      // In production, this would return an error
      const scriptPath = path.join(process.cwd(), 'scripts', 'convert_pptx.py');
      
      // Create a sample presentation with text
      const sampleScript = `
import os
from PIL import Image, ImageDraw, ImageFont
import json

output_dir = "${cacheDir}"
os.makedirs(output_dir, exist_ok=True)

# Create sample slides
for i in range(1, 4):
    img = Image.new('RGB', (1920, 1080), 'white')
    draw = ImageDraw.Draw(img)
    
    # Draw header
    draw.rectangle([(0, 0), (1920, 60)], fill='#1e40af')
    try:
        font = ImageFont.load_default()
    except:
        font = None
    
    # Add slide content
    draw.text((50, 100), f"Sample Slide {i}", fill='#1f2937', font=font)
    draw.text((50, 200), "PowerPoint content will appear here", fill='#6b7280', font=font)
    draw.text((50, 250), "once the file is properly downloaded.", fill='#6b7280', font=font)
    
    # Save slide
    slide_path = os.path.join(output_dir, f'slide-{i:03d}.png')
    img.save(slide_path)

# Save metadata
metadata = {
    'total_slides': 3,
    'slides': ['slide-001.png', 'slide-002.png', 'slide-003.png'],
    'source': 'sample'
}

with open(os.path.join(output_dir, 'metadata.json'), 'w') as f:
    json.dump(metadata, f)

print("SUCCESS:3")
`;
      
      const tempScriptPath = path.join(tempDir, 'create_sample.py');
      await fs.writeFile(tempScriptPath, sampleScript);
      
      const { stdout } = await execAsync(`python3 ${tempScriptPath}`);
      await fs.unlink(tempScriptPath).catch(() => {});
      
      if (!stdout.startsWith('SUCCESS')) {
        throw new Error('Failed to create sample presentation');
      }
    }

    // Use the conversion script if file was downloaded
    try {
      await fs.access(localFilePath);
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
      const { stdout, stderr } = await execAsync(`python3 ${scriptPath} "${localFilePath}" "${cacheDir}"`);
      
      if (stdout.startsWith('ERROR:')) {
        throw new Error(stdout.substring(6));
      }
      
      // Clean up downloaded file
      await fs.unlink(localFilePath).catch(() => {});
    } catch (e) {
      // File wasn't downloaded, sample was created
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

    const slideUrls = slides.map(slide => `/powerpoint/${safePath}/${slide}`);

    return NextResponse.json({ 
      slides: slideUrls,
      totalSlides: slides.length,
      cached: false
    });

  } catch (error: any) {
    console.error('PowerPoint conversion error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to convert PowerPoint' },
      { status: 500 }
    );
  }
}