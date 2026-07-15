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
            className="group relative aspect-video cursor-zoom-in overflow-hidden rounded-card border border-hairline bg-surface transition-colors duration-150 hover:border-accent-signal"
          >
            <img
              src={url}
              alt={`Screenshot ${idx + 1}`}
              className="h-full w-full object-cover"
            />
            {/* Hairline scrim for legibility of the expand affordance. */}
            <div className="absolute inset-0 bg-base/0 transition-colors duration-150 group-hover:bg-base/20" />
            <div className="absolute bottom-2 right-2 rounded-card border border-hairline bg-surface-raised/90 p-1 text-secondary opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              <Maximize2 size={12} />
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox Overlay */}
      {activeIdx !== null && (
        /* Lightbox overlay. The base token (#0B0D10) at high opacity stands in
           for raw black so the scrim stays within the design palette; controls
           use primary/secondary text and surface-raised fills, not white. */
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-base/90 p-4">
          {/* Close button */}
          <button
            type="button"
            onClick={() => setActiveIdx(null)}
            className="absolute top-4 right-4 z-50 rounded-card border border-hairline bg-surface-raised p-2 text-primary transition-colors duration-150 hover:text-accent-signal"
          >
            <X size={20} />
          </button>

          {/* Navigation - Prev */}
          {images.length > 1 && (
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-4 z-50 hidden rounded-card border border-hairline bg-surface-raised p-3 text-primary transition-colors duration-150 hover:text-accent-signal sm:block"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          {/* Image Container */}
          <div className="relative max-h-[85vh] max-w-[90vw] select-none flex flex-col items-center">
            <img
              src={images[activeIdx]}
              alt={`Expanded screenshot ${activeIdx + 1}`}
              className="max-h-[80vh] max-w-[90vw] rounded-card object-contain"
            />
            {images.length > 1 && (
              <span className="num text-secondary mt-3 text-xs">
                {activeIdx + 1} / {images.length}
              </span>
            )}
          </div>

          {/* Navigation - Next */}
          {images.length > 1 && (
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-4 z-50 hidden rounded-card border border-hairline bg-surface-raised p-3 text-primary transition-colors duration-150 hover:text-accent-signal sm:block"
            >
              <ChevronRight size={24} />
            </button>
          )}

          {/* Mobile Tap Zones */}
          {images.length > 1 && (
            <div className="absolute inset-x-0 bottom-4 flex justify-center gap-4 sm:hidden">
              <button
                type="button"
                onClick={handlePrev}
                className="rounded-card border border-hairline bg-surface-raised px-4 py-2 text-xs font-medium text-primary"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="rounded-card border border-hairline bg-surface-raised px-4 py-2 text-xs font-medium text-primary"
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
