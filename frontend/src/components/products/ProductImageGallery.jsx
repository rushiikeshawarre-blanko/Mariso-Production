import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const ProductImageGallery = ({ media = [], productName = 'Product' }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  const galleryImages = (media || []).filter((item) => item?.url);

  useEffect(() => {
    if (currentIndex >= galleryImages.length) {
      setCurrentIndex(0);
    }
  }, [currentIndex, galleryImages.length]);

  const slideVariants = {
    enter: (direction) => ({
      x: direction > 0 ? 500 : -500,
      opacity: 0,
      scale: 0.95
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
      scale: 1
    },
    exit: (direction) => ({
      zIndex: 0,
      x: direction < 0 ? 500 : -500,
      opacity: 0,
      scale: 0.95
    })
  };

  const swipeConfidenceThreshold = 10000;
  const swipePower = (offset, velocity) => {
    return Math.abs(offset) * velocity;
  };

  const paginate = useCallback((newDirection) => {
    setDirection(newDirection);
    setCurrentIndex((prevIndex) => {
      let nextIndex = prevIndex + newDirection;
      // Loop behavior
      if (nextIndex < 0) nextIndex = galleryImages.length - 1;
      if (nextIndex >= galleryImages.length) nextIndex = 0;
      return nextIndex;
    });
  }, [galleryImages.length]);

  const goToSlide = (index) => {
    setDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        paginate(-1);
      } else if (e.key === 'ArrowRight') {
        paginate(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [paginate]);

  if (galleryImages.length === 0) {
    return (
      <div className="aspect-[4/5] rounded-[1.75rem] bg-[#F8F5F1] flex items-center justify-center md:aspect-[3/4]">
        <p className="text-muted-foreground">No images available</p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-3 px-2 md:space-y-4 md:px-6 xl:px-0" data-testid="product-image-gallery">
      {/* Main Image Carousel */}
      <div 
        className="relative w-full aspect-[3/4] overflow-hidden rounded-[1.75rem] bg-[#F8F5F1] shadow-[0_8px_24px_rgba(0,0,0,0.05)] md:aspect-[4/5]"
      >
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          {galleryImages[currentIndex]?.type === 'video' ? (
            <motion.video
              key={currentIndex}
              src={galleryImages[currentIndex].url}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
                scale: { duration: 0.2 }
              }}
              className="absolute inset-0 h-full w-full object-contain bg-black"
              data-testid="gallery-main-video"
              controls
              playsInline
              preload="metadata"
            />
          ) : (
            <motion.img
              key={currentIndex}
              src={galleryImages[currentIndex]?.url}
              alt={`${productName} - Image ${currentIndex + 1}`}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
                scale: { duration: 0.2 }
              }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={1}
              onDragEnd={(e, { offset, velocity }) => {
                const swipe = swipePower(offset.x, velocity.x);
                if (swipe < -swipeConfidenceThreshold) {
                  paginate(1);
                } else if (swipe > swipeConfidenceThreshold) {
                  paginate(-1);
                }
              }}
              className="absolute inset-0 h-full w-full object-cover cursor-grab active:cursor-grabbing"
              data-testid="gallery-main-image"
            />
          )}
        </AnimatePresence>

        {/* Navigation Arrows */}
        <button
          onClick={() => paginate(-1)}
          className="absolute left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-[0_10px_25px_rgba(0,0,0,0.12)] transition hover:bg-white sm:left-4 sm:h-12 sm:w-12"
          aria-label="Previous image"
          data-testid="gallery-prev-button"
        >
          <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => paginate(1)}
          className="absolute right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-[0_10px_25px_rgba(0,0,0,0.12)] transition hover:bg-white sm:right-4 sm:h-12 sm:w-12"
          aria-label="Next image"
          data-testid="gallery-next-button"
        >
          <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.5} />
        </button>

        {/* Image Counter */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium shadow-lg z-10">
          {currentIndex + 1} / {galleryImages.length}
        </div>
      </div>

      {/* Thumbnail Strip */}
      <div className="overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory" data-testid="gallery-thumbnails">
        <div className="flex w-max min-w-full justify-center gap-3">
          {galleryImages.map((image, index) => (
            <motion.button
              key={index}
              onClick={() => goToSlide(index)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`relative flex-shrink-0 w-14 h-[4.25rem] md:w-24 md:h-28 rounded-lg overflow-hidden snap-start transition-all duration-300 ${
                currentIndex === index 
                  ? 'ring-2 ring-foreground ring-offset-2' 
                  : 'ring-1 ring-border hover:ring-foreground/50'
              }`}
              data-testid={`gallery-thumbnail-${index}`}
              aria-label={`View image ${index + 1}`}
              aria-current={currentIndex === index ? 'true' : 'false'}
            >
              {image.type === 'video' ? (
                <div className="relative h-full w-full bg-black">
                  <video
                    src={image.url}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-[10px] font-medium">
                    Video
                  </div>
                </div>
              ) : (
                <img
                  src={image.url}
                  alt={`${productName} thumbnail ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              )}
              {currentIndex === index && (
                <motion.div
                  layoutId="thumbnail-indicator"
                  className="absolute inset-0 bg-foreground/10"
                  initial={false}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProductImageGallery;
