'use client';

import { useState, useRef } from 'react';
import { Upload, Camera, X, Check } from 'lucide-react';
import { hasCamera } from '@/lib/utils/device';
import { validateSelectedFile, getFileSizeLimitText } from '@/lib/utils/fileValidation';

interface CameraCaptureUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  className?: string;
  children?: React.ReactNode;
  showPreview?: boolean;
}

export default function CameraCaptureUpload({
  onFileSelect,
  accept = "image/*,application/pdf,.doc,.docx,.txt",
  className = '',
  children,
  showPreview = true
}: CameraCaptureUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const deviceHasCamera = hasCamera();

  const processFile = (file: File | null) => {
    if (!file) return;

    setError(null);

    // Use centralized validation
    const validation = validateSelectedFile(file);
    if (!validation.valid) {
      setError(validation.error!);
      return;
    }

    setSelectedFile(file);

    // Generate preview for images
    if (showPreview && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    processFile(file || null);
  };

  const confirmUpload = () => {
    if (selectedFile) {
      onFileSelect(selectedFile);
      // Clear preview after confirming
      setSelectedFile(null);
      setPreviewUrl(null);
      setError(null);
      // Reset input values
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const cancelSelection = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
    // Reset input values
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const openCamera = () => {
    cameraInputRef.current?.click();
  };

  // If custom children provided, use them
  if (children && !selectedFile) {
    return (
      <>
        <div onClick={openFileDialog} className={className}>
          {children}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileInput}
          className="hidden"
        />
        {deviceHasCamera && (
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileInput}
            className="hidden"
          />
        )}
      </>
    );
  }

  // Preview mode
  if (selectedFile && showPreview) {
    return (
      <div className={`border-2 border-dashed border-gray-300 rounded-lg p-4 ${className}`}>
        <div className="space-y-4">
          {previewUrl ? (
            <div className="relative">
              <img 
                src={previewUrl} 
                alt="Preview" 
                className="max-w-full h-auto max-h-64 mx-auto rounded-lg"
              />
              <div className="absolute top-2 right-2 flex gap-2">
                <button
                  onClick={cancelSelection}
                  className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
                  title="Cancel"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-600">
                Selected: {selectedFile.name}
              </p>
              <p className="text-xs text-gray-500">
                Size: {(selectedFile.size / 1024 / 1024).toFixed(2)}MB
              </p>
            </div>
          )}
          
          {error && (
            <div className="text-red-500 text-sm text-center">{error}</div>
          )}

          <div className="flex gap-2 justify-center">
            <button
              onClick={confirmUpload}
              disabled={!!error}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Check size={20} />
              Use This {previewUrl ? 'Photo' : 'File'}
            </button>
            <button
              onClick={cancelSelection}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              Choose Different
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default upload interface
  return (
    <div className={`border-2 border-dashed border-gray-300 rounded-lg p-6 ${className}`}>
      <div className="text-center space-y-4">
        {error && (
          <div className="text-red-500 text-sm">{error}</div>
        )}
        
        <div className="space-y-2">
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          <p className="text-sm text-gray-600">
            Choose how to add your file
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {deviceHasCamera && (
            <button
              onClick={openCamera}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              <Camera size={20} />
              Take Photo
            </button>
          )}
          
          <button
            onClick={openFileDialog}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 flex items-center justify-center gap-2"
          >
            <Upload size={20} />
            Upload File
          </button>
        </div>

        <p className="text-xs text-gray-500">
          {getFileSizeLimitText(accept)}
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileInput}
        className="hidden"
      />
      
      {deviceHasCamera && (
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileInput}
          className="hidden"
        />
      )}
    </div>
  );
}