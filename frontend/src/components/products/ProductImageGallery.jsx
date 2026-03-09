import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const ProductImageGallery = ({ images = [], productName = 'Product' }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  // Minimum swipe distance
  const minSwipeDistance = 50;

  // Ensure we have at least 5 images by duplicating if needed
  const galleryImages = images.length >= 5 
    ? images 
    : [...images, ...images, ...images, ...images, ...images].slice(0, Math.max(5, images.length));

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

  // Touch handlers for mobile swipe
  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe) {
      paginate(1);
    } else if (isRightSwipe) {
      paginate(-1);
    }
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
      <div className="aspect-[3/4] bg-muted rounded-xl flex items-center justify-center">
        <p className="text-muted-foreground">No images available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="product-image-gallery">
      {/* Main Image Carousel */}
      <div 
        className="relative aspect-[3/4] md:aspect-square lg:aspect-[3/4] bg-muted rounded-xl overflow-hidden group"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.img
            key={currentIndex}
            src={galleryImages[currentIndex]}
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
            className="absolute inset-0 w-full h-full object-cover cursor-grab active:cursor-grabbing"
            data-testid="gallery-main-image"
          />
        </AnimatePresence>

        {/* Navigation Arrows */}
        <button
          onClick={() => paginate(-1)}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-white hover:scale-110 z-10"
          aria-label="Previous image"
          data-testid="gallery-prev-button"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => paginate(1)}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-white hover:scale-110 z-10"
          aria-label="Next image"
          data-testid="gallery-next-button"
        >
          <ChevronRight className="h-6 w-6" strokeWidth={1.5} />
        </button>

        {/* Image Counter */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium shadow-lg z-10">
          {currentIndex + 1} / {galleryImages.length}
        </div>

        {/* Dots Indicator (Mobile) */}
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-2 md:hidden z-10">
          {galleryImages.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                currentIndex === index 
                  ? 'bg-foreground w-6' 
                  : 'bg-foreground/30 hover:bg-foreground/50'
              }`}
              aria-label={`Go to image ${index + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Thumbnail Strip */}
      <div className="relative" data-testid="gallery-thumbnails">
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
          {galleryImages.map((image, index) => (
            <motion.button
              key={index}
              onClick={() => goToSlide(index)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`relative flex-shrink-0 w-20 h-24 md:w-24 md:h-28 rounded-lg overflow-hidden snap-start transition-all duration-300 ${
                currentIndex === index 
                  ? 'ring-2 ring-foreground ring-offset-2' 
                  : 'ring-1 ring-border hover:ring-foreground/50'
              }`}
              data-testid={`gallery-thumbnail-${index}`}
              aria-label={`View image ${index + 1}`}
              aria-current={currentIndex === index ? 'true' : 'false'}
            >
              <img
                src={image}
                alt={`${productName} thumbnail ${index + 1}`}
                className="w-full h-full object-cover"
              />
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
