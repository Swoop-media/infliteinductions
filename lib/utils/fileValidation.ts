// Centralized file validation utility
export interface FileValidationOptions {
  imageMaxMB?: number;
  docMaxMB?: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateSelectedFile(
  file: File,
  options: FileValidationOptions = { imageMaxMB: 5, docMaxMB: 35 }
): ValidationResult {
  const { imageMaxMB = 5, docMaxMB = 35 } = options;
  
  // Block PowerPoint files
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith('.ppt') || fileName.endsWith('.pptx')) {
    return {
      valid: false,
      error: 'PowerPoint files are not supported. Please convert to PDF before uploading.'
    };
  }
  
  // Determine if it's an image or document
  const isImage = file.type.startsWith('image/');
  const maxSizeMB = isImage ? imageMaxMB : docMaxMB;
  const maxSize = maxSizeMB * 1024 * 1024;
  
  // Check file size
  if (file.size > maxSize) {
    const fileType = isImage ? 'Image' : 'Document';
    return {
      valid: false,
      error: `${fileType} size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the ${maxSizeMB}MB limit.`
    };
  }
  
  return { valid: true };
}

export function getFileSizeLimitText(accept?: string): string {
  if (!accept) return 'Images: max 5MB • Documents: max 35MB - use an online compressor for larger files';
  
  if (accept.includes('image') && !accept.includes('pdf') && !accept.includes('doc')) {
    return 'Maximum image size: 5MB';
  }
  
  if (!accept.includes('image')) {
    return 'Maximum document size: 35MB - use an online compressor for larger files';
  }
  
  return 'Images: max 5MB • Documents: max 35MB - use an online compressor for larger files';
}

export function isFileTypeAllowed(file: File, accept?: string): boolean {
  if (!accept) return true; // If no accept specified, allow all (except PPT which is checked separately)
  
  const acceptedTypes = accept.split(',').map(t => t.trim().toLowerCase());
  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();
  
  // Check if file matches any accepted type
  return acceptedTypes.some(acceptType => {
    // Handle wildcards like image/*
    if (acceptType.endsWith('/*')) {
      const prefix = acceptType.slice(0, -2);
      return fileType.startsWith(prefix + '/');
    }
    
    // Handle extensions like .pdf, .doc
    if (acceptType.startsWith('.')) {
      return fileName.endsWith(acceptType);
    }
    
    // Handle full MIME types
    if (acceptType.includes('/')) {
      return fileType === acceptType;
    }
    
    // Handle special cases for common document types
    if (acceptType === 'application/pdf' && fileName.endsWith('.pdf')) return true;
    if ((acceptType === 'application/msword' || acceptType.includes('doc')) && 
        (fileName.endsWith('.doc') || fileName.endsWith('.docx'))) return true;
    
    return false;
  });
}