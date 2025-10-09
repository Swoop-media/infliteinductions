'use client';

import { useState, useRef } from 'react';
import { Camera, X, Check, Upload, Trash2, Plus, FileText } from 'lucide-react';
import { hasCamera } from '@/lib/utils/device';
import { imagesToPdf, loadImageData, ImageData } from '@/lib/utils/imagesToPdf';

interface MultiPhotoCaptureUploadProps {
  onFileSelect: (file: File) => void;
  maxPhotos?: number;
  className?: string;
  label?: string;
}

export default function MultiPhotoCaptureUpload({
  onFileSelect,
  maxPhotos = 10,
  className = '',
  label = 'Document Upload'
}: MultiPhotoCaptureUploadProps) {
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deviceHasCamera = hasCamera();

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setCapturedImages(prev => [...prev, dataUrl]);
      setError(null);
      
      // Reset input to allow capturing the same image again if needed
      if (cameraInputRef.current) {
        cameraInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: string[] = [];
    let processed = 0;

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) {
        setError('Only image files are allowed for multi-photo documents');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        newImages.push(reader.result as string);
        processed++;
        
        if (processed === files.length) {
          setCapturedImages(prev => [...prev, ...newImages].slice(0, maxPhotos));
          setError(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setCapturedImages(prev => prev.filter((_, i) => i !== index));
  };

  const openCamera = () => {
    cameraInputRef.current?.click();
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const generatePdfAndUpload = async () => {
    if (capturedImages.length === 0) {
      setError('Please capture at least one photo');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Load all images and get their dimensions
      const imageDataPromises = capturedImages.map(dataUrl => loadImageData(dataUrl));
      const imagesData = await Promise.all(imageDataPromises);

      // Generate PDF from images
      const pdfFile = await imagesToPdf(imagesData, `document_${Date.now()}.pdf`);
      
      // Pass the PDF file to the parent component
      onFileSelect(pdfFile);
      
      // Show confirmation
      setShowConfirmation(true);
      
      // Clear captured images after successful upload
      setTimeout(() => {
        setCapturedImages([]);
        setShowConfirmation(false);
      }, 2000);
      
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError('Failed to generate PDF. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setCapturedImages([]);
    setError(null);
    setShowConfirmation(false);
  };

  if (showConfirmation) {
    return (
      <div className="border-2 border-green-500 rounded-lg p-6 text-center bg-green-50">
        <div className="flex flex-col items-center space-y-2">
          <Check className="h-12 w-12 text-green-600" />
          <p className="font-medium text-green-800">Document Created Successfully!</p>
          <p className="text-sm text-green-600">
            {capturedImages.length} photo{capturedImages.length !== 1 ? 's' : ''} combined into PDF
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">{label}</h3>
        {capturedImages.length > 0 && (
          <span className="text-xs text-gray-500">
            {capturedImages.length}/{maxPhotos} photos captured
          </span>
        )}
      </div>

      {/* Captured Images Preview */}
      {capturedImages.length > 0 && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <div className="grid grid-cols-3 gap-2">
            {capturedImages.map((image, index) => (
              <div key={index} className="relative group">
                <img
                  src={image}
                  alt={`Captured ${index + 1}`}
                  className="w-full h-24 object-cover rounded border"
                />
                <button
                  onClick={() => removeImage(index)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove this photo"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="absolute bottom-1 left-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded">
                  {index + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Capture Options */}
      <div className="flex flex-col sm:flex-row gap-2">
        {deviceHasCamera && capturedImages.length < maxPhotos && (
          <button
            type="button"
            onClick={openCamera}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <Camera className="h-5 w-5 text-gray-600" />
            <span className="text-sm">Take Photo</span>
          </button>
        )}

        {capturedImages.length < maxPhotos && (
          <button
            type="button"
            onClick={openFileDialog}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <Plus className="h-5 w-5 text-gray-600" />
            <span className="text-sm">Add Photos</span>
          </button>
        )}
      </div>

      {/* Action Buttons */}
      {capturedImages.length > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={generatePdfAndUpload}
            disabled={isProcessing}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            {isProcessing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                <span>Create Document</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={isProcessing}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Instructions */}
      {capturedImages.length === 0 && (
        <div className="text-xs text-gray-500 space-y-1">
          <p>• Take multiple photos to capture all pages/sides of your document</p>
          <p>• Photos will be combined into a single PDF document</p>
          <p>• You can capture up to {maxPhotos} photos</p>
        </div>
      )}

      {/* Hidden Inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraCapture}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );
}