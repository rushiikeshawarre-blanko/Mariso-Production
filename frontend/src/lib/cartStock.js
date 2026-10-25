// Colour/fragrance options can share base inventory without separate variants.
export const getCartAvailableStock = (product, item) => {
  if (!product) return 0;
  const variants = product.variants || [];
  if (!variants.length) {
    if (item.variantId || item.selectedPackId || product.sell_as_pack) return 0;
    return product.stock ?? 0;
  }
  const normalize = (value) => value || null;
  const variant = variants.find((v) => v.is_active !== false && (
    item.variantId ? v.id === item.variantId : (
      normalize(v.color_id) === normalize(item.selectedColorId) &&
      normalize(v.flavor_id) === normalize(item.selectedFlavorId) &&
      normalize(v.pack_option_id) === normalize(item.selectedPackId)
    )
  ));
  return variant?.stock ?? 0;
};
