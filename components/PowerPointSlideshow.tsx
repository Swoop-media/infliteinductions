'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import Image from 'next/image';

interface PowerPointSlideshowProps {
  filePath: string;
  title?: string;
}

export default function PowerPointSlideshow({ filePath, title }: PowerPointSlideshowProps) {
  const [slides, setSlides] = useState<string[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    loadSlides();
  }, [filePath]);

  const loadSlides = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/powerpoint/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filePath }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load presentation');
      }

      const data = await response.json();
      setSlides(data.slides || []);
      setCurrentSlide(0);
    } catch (err: any) {
      setError(err.message || 'Failed to load presentation');
    } finally {
      setLoading(false);
    }
  };

  const goToSlide = (index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentSlide(index);
    }
  };

  const nextSlide = () => goToSlide(currentSlide + 1);
  const prevSlide = () => goToSlide(currentSlide - 1);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      nextSlide();
    } else if (e.key === 'ArrowLeft') {
      prevSlide();
    } else if (e.key === 'Escape' && isFullscreen) {
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSlide, slides.length, isFullscreen]);

  if (loading) {
    return (
      <div className="rounded-md border bg-white overflow-hidden">
        <div className="p-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 mb-4">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-gray-600">Loading presentation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border bg-white overflow-hidden">
        <div className="p-8 text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-2">Failed to Load Presentation</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={loadSlides}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (slides.length === 0) {
    return (
      <div className="rounded-md border bg-white overflow-hidden">
        <div className="p-8 text-center">
          <p className="text-gray-600">No slides found in this presentation</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-black' : 'rounded-md border bg-white overflow-hidden'}`}>
      {/* Header */}
      {!isFullscreen && (
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10 6H5c-1.11 0-2 .89-2 2v8c0 1.11.89 2 2 2h5v-2H5V8h5V6zm9 0h-5v2h5v8h-5v2h5c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-7 5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/>
            </svg>
            <span className="font-medium">{title || 'PowerPoint Presentation'}</span>
          </div>
          <button
            onClick={() => setIsFullscreen(true)}
            className="p-1 hover:bg-gray-200 rounded"
            title="Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Slide Display */}
      <div className={`relative ${isFullscreen ? 'h-full flex items-center justify-center' : 'aspect-video bg-gray-100'}`}>
        <img
          src={slides[currentSlide]}
          alt={`Slide ${currentSlide + 1}`}
          className={`${isFullscreen ? 'max-w-full max-h-full object-contain' : 'w-full h-full object-contain'}`}
        />
        
        {/* Navigation Buttons */}
        <button
          onClick={prevSlide}
          disabled={currentSlide === 0}
          className={`absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed ${isFullscreen ? 'p-3' : ''}`}
        >
          <ChevronLeft className={isFullscreen ? 'w-8 h-8' : 'w-6 h-6'} />
        </button>
        
        <button
          onClick={nextSlide}
          disabled={currentSlide === slides.length - 1}
          className={`absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed ${isFullscreen ? 'p-3' : ''}`}
        >
          <ChevronRight className={isFullscreen ? 'w-8 h-8' : 'w-6 h-6'} />
        </button>

        {/* Slide Counter */}
        <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/50 text-white text-sm ${isFullscreen ? 'text-base px-4 py-2' : ''}`}>
          {currentSlide + 1} / {slides.length}
        </div>

        {/* Exit Fullscreen Button */}
        {isFullscreen && (
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
            title="Exit Fullscreen (Esc)"
          >
            <Minimize2 className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Slide Thumbnails */}
      {!isFullscreen && slides.length > 1 && (
        <div className="px-4 py-3 border-t bg-gray-50">
          <div className="flex gap-2 overflow-x-auto">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`flex-shrink-0 w-12 h-8 rounded border-2 transition-colors ${
                  index === currentSlide
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                title={`Go to slide ${index + 1}`}
              >
                <span className="text-xs">{index + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      {!isFullscreen && (
        <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-600">
          Use arrow keys or click navigation buttons to browse slides • Press Space for next slide • Click fullscreen for presentation mode
        </div>
      )}
    </div>
  );
}