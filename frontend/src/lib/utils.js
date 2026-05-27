import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function getProductPath(product) {
  const slug = String(product?.slug || '').trim();
  if (slug) {
    return `/products/${encodeURIComponent(slug)}`;
  }

  const id = String(product?.id || '').trim();
  if (id) {
    return `/product/${encodeURIComponent(id)}`;
  }

  return null;
}

export function normalizeImageUrl(image) {
  if (typeof image === 'string') {
    return image;
  }

  if (!image || typeof image !== 'object') {
    return '';
  }

  return image.url || image.detail_url || image.card_url || image.thumb_url || '';
}

export function getThumbImage(image) {
  if (typeof image === 'string') {
    return image;
  }

  if (!image || typeof image !== 'object') {
    return '';
  }

  return image.thumb_url || image.card_url || image.detail_url || image.url || '';
}

export function getCardImage(image) {
  if (typeof image === 'string') {
    return image;
  }

  if (!image || typeof image !== 'object') {
    return '';
  }

  return image.card_url || image.thumb_url || image.detail_url || image.url || '';
}

export function getDetailImage(image) {
  if (typeof image === 'string') {
    return image;
  }

  if (!image || typeof image !== 'object') {
    return '';
  }

  return image.detail_url || image.url || image.card_url || image.thumb_url || '';
}

export function getFirstImageUrl(images, resolver = normalizeImageUrl) {
  for (const image of images || []) {
    const url = resolver(image);
    if (url) {
      return url;
    }
  }

  return '';
}

export function getProductCardImage(product) {
  return (
    getFirstImageUrl(product?.images, getCardImage) ||
    getFirstImageUrl(
      (product?.color_options || []).flatMap((color) => color?.images || []),
      getCardImage
    ) ||
    'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800'
  );
}

export function getProductThumbImage(product) {
  return (
    getFirstImageUrl(product?.images, getThumbImage) ||
    getFirstImageUrl(
      (product?.color_options || []).flatMap((color) => color?.images || []),
      getThumbImage
    ) ||
    'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=200'
  );
}
