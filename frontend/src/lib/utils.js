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

export function getProductCardImage(product) {
  return (
    (product?.images || []).filter(Boolean)[0] ||
    (product?.color_options || [])
      .flatMap((color) => color?.images || [])
      .filter(Boolean)[0] ||
    'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800'
  );
}
