'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScreenshotGalleryProps {
  images: string[];
}

export function ScreenshotGallery({ images }: ScreenshotGalleryProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const handleNext = useCallback(() => {
    setActiveIdx((prev) => (prev === null ? null : (prev + 1) % images.length));
  }, [images.length]);

  const handlePrev = useCallback(() => {
    setActiveIdx((prev) => (prev === null ? null : (prev - 1 + images.length) % images.length));
  }, [images.length]);

  // Close lightbox on Escape key
  useEffect(() => {
    if (activeIdx === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveIdx(null);
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIdx, handleNext, handlePrev]);

  if (!images || images.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="font-display text-primary text-xs uppercase tracking-wide">
        Trade Screenshots
      </h2>
      <div className={cn(
        "grid gap-4",
        images.length === 1 ? "grid-cols-1" : images.length === 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3"
      )}>
        {images.map((url, idx) => (
          <div
            key={url}
            onClick={() => setActiveIdx(idx)}
            className="group relative aspect-video cursor-zoom-in overflow-hidden rounded-card border border-hairline bg-surface transition-all duration-200 hover:border-accent-signal hover:scale-[1.02] hover:shadow-md"
          >
            <img
              src={url}
              alt={`Screenshot ${idx + 1}`}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/20" />
            <div className="absolute bottom-2 right-2 rounded-full border border-hairline bg-surface-raised/90 p-1 text-secondary opacity-0 transition-opacity duration-200 group-hover:opacity-100 shadow-sm">
              <Maximize2 size={12} />
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox Overlay */}
      {activeIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md transition-opacity duration-300">
          {/* Close button */}
          <button
            type="button"
            onClick={() => setActiveIdx(null)}
            className="absolute top-4 right-4 z-50 rounded-full border border-white/10 bg-white/5 p-2 text-white hover:bg-white/15 transition-all shadow-lg"
          >
            <X size={20} />
          </button>

          {/* Navigation - Prev */}
          {images.length > 1 && (
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-4 z-50 rounded-full border border-white/10 bg-white/5 p-3 text-white hover:bg-white/15 transition-all shadow-lg hidden sm:block"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          {/* Image Container */}
          <div className="relative max-h-[85vh] max-w-[90vw] select-none flex flex-col items-center">
            <img
              src={images[activeIdx]}
              alt={`Expanded screenshot ${activeIdx + 1}`}
              className="max-h-[80vh] max-w-[90vw] object-contain rounded shadow-2xl animate-fade-in"
            />
            {images.length > 1 && (
              <span className="text-white/60 text-xs mt-3 font-mono">
                {activeIdx + 1} / {images.length}
              </span>
            )}
          </div>

          {/* Navigation - Next */}
          {images.length > 1 && (
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-4 z-50 rounded-full border border-white/10 bg-white/5 p-3 text-white hover:bg-white/15 transition-all shadow-lg hidden sm:block"
            >
              <ChevronRight size={24} />
            </button>
          )}

          {/* Mobile Swipe / Tap Zones */}
          {images.length > 1 && (
            <div className="absolute inset-x-0 bottom-4 flex justify-center gap-4 sm:hidden">
              <button
                type="button"
                onClick={handlePrev}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white text-xs font-medium"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white text-xs font-medium"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
