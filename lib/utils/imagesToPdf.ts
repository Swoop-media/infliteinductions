// @ts-nocheck

import jsPDF from 'jspdf';

export interface ImageData {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Converts multiple images to a single PDF file
 * @param images Array of image data URLs
 * @param fileName Name for the generated PDF file
 * @returns Promise<File> The generated PDF file
 */
export async function imagesToPdf(images: ImageData[], fileName: string = 'document.pdf'): Promise<File> {
  if (images.length === 0) {
    throw new Error('No images provided');
  }

  // Create PDF with A4 dimensions (210mm x 297mm)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const maxWidth = pageWidth - (margin * 2);
  const maxHeight = pageHeight - (margin * 2);

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    
    // Add new page for each image except the first
    if (i > 0) {
      pdf.addPage();
    }

    // Calculate dimensions to fit image within page while maintaining aspect ratio
    let imgWidth = image.width;
    let imgHeight = image.height;
    
    const widthRatio = maxWidth / imgWidth;
    const heightRatio = maxHeight / imgHeight;
    const ratio = Math.min(widthRatio, heightRatio);
    
    if (ratio < 1) {
      imgWidth = imgWidth * ratio;
      imgHeight = imgHeight * ratio;
    }

    // Center the image on the page
    const x = (pageWidth - imgWidth) / 2;
    const y = (pageHeight - imgHeight) / 2;

    // Add image to PDF
    pdf.addImage(image.dataUrl, 'JPEG', x, y, imgWidth, imgHeight);
  }

  // Convert PDF to blob
  const pdfBlob = pdf.output('blob');
  
  // Create File object from blob
  const file = new File([pdfBlob], fileName, {
    type: 'application/pdf',
    lastModified: Date.now()
  });

  return file;
}

/**
 * Loads an image and gets its dimensions
 * @param dataUrl The data URL of the image
 * @returns Promise<ImageData> Image data with dimensions
 */
export function loadImageData(dataUrl: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        dataUrl,
        width: img.width,
        height: img.height
      });
    };
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    img.src = dataUrl;
  });
}