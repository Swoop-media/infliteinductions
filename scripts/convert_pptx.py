#!/usr/bin/env python3
"""
Convert PowerPoint slides to images for web display.
Uses python-pptx to extract slides and Pillow for image processing.
"""

import sys
import os
import json
from pathlib import Path
from pptx import Presentation
from PIL import Image, ImageDraw, ImageFont
import io
import base64

def extract_text_from_slide(slide):
    """Extract all text from a slide."""
    texts = []
    for shape in slide.shapes:
        if hasattr(shape, "text"):
            if shape.text.strip():
                texts.append(shape.text)
    return texts

def create_slide_image(slide, slide_num, output_path, width=1920, height=1080):
    """
    Create a simplified image representation of a slide.
    Since we cannot directly render PPTX to images without additional tools,
    we'll create a clean representation with the slide's text content.
    """
    # Create a white background
    img = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(img)
    
    # Extract text from slide
    texts = extract_text_from_slide(slide)
    
    # Draw slide number
    draw.rectangle([(0, 0), (width, 60)], fill='#1e40af')
    try:
        # Try to use a default font, fallback to basic if not available
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)
        body_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
    except:
        # Use default font if system fonts not available
        title_font = ImageFont.load_default()
        body_font = ImageFont.load_default()
    
    # Draw slide header
    draw.text((20, 15), f"Slide {slide_num}", fill='white', font=title_font)
    
    # Draw text content
    y_position = 100
    max_width = width - 100
    
    for text in texts:
        # Word wrap for long text
        words = text.split()
        lines = []
        current_line = []
        
        for word in words:
            current_line.append(word)
            test_line = ' '.join(current_line)
            # Simple width check (approximate)
            if len(test_line) * 10 > max_width:
                if len(current_line) > 1:
                    current_line.pop()
                    lines.append(' '.join(current_line))
                    current_line = [word]
                else:
                    lines.append(test_line)
                    current_line = []
        
        if current_line:
            lines.append(' '.join(current_line))
        
        # Draw each line
        for line in lines:
            if y_position < height - 100:
                draw.text((50, y_position), line, fill='#1f2937', font=body_font)
                y_position += 30
        
        y_position += 20  # Extra space between text blocks
    
    # Add footer
    draw.rectangle([(0, height - 40), (width, height)], fill='#f3f4f6')
    draw.text((20, height - 30), f"PowerPoint Presentation - Page {slide_num}", fill='#6b7280', font=body_font)
    
    # Save image
    img.save(output_path, 'PNG')
    return True

def convert_presentation(pptx_path, output_dir):
    """Convert a PowerPoint presentation to a series of images."""
    try:
        # Load presentation
        prs = Presentation(pptx_path)
        
        # Create output directory
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        slide_images = []
        
        for i, slide in enumerate(prs.slides, 1):
            slide_filename = f"slide-{i:03d}.png"
            slide_path = os.path.join(output_dir, slide_filename)
            
            # Create slide image
            if create_slide_image(slide, i, slide_path):
                slide_images.append(slide_filename)
        
        # Also save metadata
        metadata = {
            'total_slides': len(prs.slides),
            'slides': slide_images,
            'source': os.path.basename(pptx_path)
        }
        
        metadata_path = os.path.join(output_dir, 'metadata.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        return {
            'success': True,
            'total_slides': len(slide_images),
            'slides': slide_images
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python convert_pptx.py <input.pptx> <output_dir>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_dir = sys.argv[2]
    
    result = convert_presentation(input_file, output_dir)
    
    if result['success']:
        print(f"SUCCESS:{result['total_slides']}")
    else:
        print(f"ERROR:{result['error']}")
        sys.exit(1)