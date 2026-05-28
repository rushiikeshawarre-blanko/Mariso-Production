import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { ProductCard } from '../components/products/ProductCard';
import { Button } from '../components/ui/button';
import MarisoLoader from '../components/ui/MarisoLoader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../components/ui/sheet';
import { SlidersHorizontal, X } from 'lucide-react';
import { getProducts, getCategories } from '../lib/api';

const SHOP_REVALIDATE_INTERVAL_MS = 5 * 1000;

const parseCategoryParam = (value) => (
  value ? value.split(',').map((item) => item.trim()).filter(Boolean) : []
);

const normalizeId = (value) => (value == null ? '' : String(value));

const matchesCategoryParam = (category, value) => {
  const normalizedValue = normalizeId(value);
  return normalizeId(category?.id) === normalizedValue || category?.slug === normalizedValue;
};

const getEffectivePrice = (product) => {
  const hasSalePrice = product.is_on_sale && product.discount_price != null;
  return Number(hasSalePrice ? product.discount_price : product.price) || 0;
};

const getEffectiveStock = (product) => {
  const activeVariants = Array.isArray(product.variants)
    ? product.variants.filter((variant) => variant?.is_active !== false)
    : [];

  if (activeVariants.length > 0) {
    return activeVariants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);
  }

  return Number(product.stock) || 0;
};

const ShopPage = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [sortBy, setSortBy] = useState('recommended');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(parseCategoryParam(searchParams.get('category')));
  const [selectedParentSlug, setSelectedParentSlug] = useState(searchParams.get('parent') || '');
  const [sidebarParentSlug, setSidebarParentSlug] = useState(searchParams.get('parent') || '');
  const [shouldInferCategoryContext, setShouldInferCategoryContext] = useState(
    !searchParams.get('parent') && parseCategoryParam(searchParams.get('category')).length === 1
  );
  const [showOnSale, setShowOnSale] = useState(searchParams.get('sale') === 'true');
  const [showFeatured, setShowFeatured] = useState(searchParams.get('featured') === 'true');
  const [showBestsellers, setShowBestsellers] = useState(searchParams.get('bestsellers') === 'true');
  const [availabilityFilter, setAvailabilityFilter] = useState(searchParams.get('availability') || 'all');
  const [priceMin, setPriceMin] = useState(searchParams.get('min_price') || '');
  const [priceMax, setPriceMax] = useState(searchParams.get('max_price') || '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [productsStatus, setProductsStatus] = useState('loading');
  const requestSequenceRef = useRef(0);
  const lastRevalidationRef = useRef(0);
  const routeRevalidationKeyRef = useRef(null);
  const categoriesRef = useRef([]);
  const skipNextCategoryContextRef = useRef(false);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);

  useEffect(() => {
    setSearchQuery(searchParams.get('search') || '');
    setSelectedCategoryIds(parseCategoryParam(searchParams.get('category')));
    setSelectedParentSlug(searchParams.get('parent') || '');

    const parentParam = searchParams.get('parent') || '';
    const categoryParams = parseCategoryParam(searchParams.get('category'));
    const skipCategoryContext = skipNextCategoryContextRef.current;
    skipNextCategoryContextRef.current = false;

    if (parentParam) {
      setSidebarParentSlug(parentParam);
      setShouldInferCategoryContext(false);
    } else if (categoryParams.length === 0) {
      setSidebarParentSlug('');
      setShouldInferCategoryContext(false);
    } else if (skipCategoryContext) {
      setShouldInferCategoryContext(false);
    } else if (categoryParams.length > 1) {
      setSidebarParentSlug('');
      setShouldInferCategoryContext(false);
    } else {
      setShouldInferCategoryContext(true);
    }

    setShowOnSale(searchParams.get('sale') === 'true');
    setShowFeatured(searchParams.get('featured') === 'true');
    setShowBestsellers(searchParams.get('bestsellers') === 'true');
    setAvailabilityFilter(searchParams.get('availability') || 'all');
    setPriceMin(searchParams.get('min_price') || '');
    setPriceMax(searchParams.get('max_price') || '');
  }, [searchParams]);

  const parentCategories = useMemo(() => {
    return categories
      .filter((category) => !category.parent_id && category.is_active !== false)
      .sort(
        (a, b) =>
          (a.sort_order || 0) - (b.sort_order || 0) ||
          a.name.localeCompare(b.name)
      );
  }, [categories]);

  const childCategories = useMemo(() => {
    return categories
      .filter((category) => category.parent_id && category.is_active !== false)
      .sort(
        (a, b) =>
          (a.sort_order || 0) - (b.sort_order || 0) ||
          a.name.localeCompare(b.name)
      );
  }, [categories]);

  const selectedParentCategoryFromParam = useMemo(() => {
    if (!selectedParentSlug) return null;
    return parentCategories.find((category) => category.slug === selectedParentSlug) || null;
  }, [parentCategories, selectedParentSlug]);

  const sidebarParentCategoryFromSlug = useMemo(() => {
    if (!sidebarParentSlug) return null;
    return parentCategories.find((category) => category.slug === sidebarParentSlug) || null;
  }, [parentCategories, sidebarParentSlug]);

  const categoryByParam = useMemo(() => {
    const categoryMap = new Map();
    categories.forEach((category) => {
      categoryMap.set(normalizeId(category.id), category);
      if (category.slug) {
        categoryMap.set(category.slug, category);
      }
    });
    return categoryMap;
  }, [categories]);

  const activeParentCategory = useMemo(() => {
    if (selectedParentCategoryFromParam) return selectedParentCategoryFromParam;
    if (sidebarParentCategoryFromSlug) return sidebarParentCategoryFromSlug;
    return null;
  }, [selectedParentCategoryFromParam, sidebarParentCategoryFromSlug]);

  useEffect(() => {
    if (!shouldInferCategoryContext || selectedParentSlug || sidebarParentSlug || selectedCategoryIds.length !== 1) return;

    const selectedCategory = categoryByParam.get(normalizeId(selectedCategoryIds[0]));
    if (!selectedCategory) return;

    if (!selectedCategory.parent_id) {
      if (selectedCategory.slug) {
        setSidebarParentSlug(selectedCategory.slug);
      }
      return;
    }

    const parentCategory = parentCategories.find(
      (category) => normalizeId(category.id) === normalizeId(selectedCategory.parent_id)
    );

    if (parentCategory?.slug) {
      setSidebarParentSlug(parentCategory.slug);
    }
  }, [categoryByParam, parentCategories, selectedCategoryIds, selectedParentSlug, shouldInferCategoryContext, sidebarParentSlug]);

  const visibleCategoryGroups = useMemo(() => {
    const parentsToShow = activeParentCategory ? [activeParentCategory] : parentCategories;

    return parentsToShow.map((parent) => ({
      parent,
      children: childCategories.filter((category) => normalizeId(category.parent_id) === normalizeId(parent.id)),
    }));
  }, [activeParentCategory, parentCategories, childCategories]);

  const filterProductsForView = useCallback((allProducts, categoriesForFiltering) => {
    let filtered = [...(allProducts || [])];

    const activeParents = categoriesForFiltering.filter(
      (category) => !category.parent_id && category.is_active !== false
    );
    const activeChildren = categoriesForFiltering.filter(
      (category) => category.parent_id && category.is_active !== false
    );

    const categoryLookup = new Map();
    categoriesForFiltering.forEach((category) => {
      categoryLookup.set(normalizeId(category.id), category);
      if (category.slug) {
        categoryLookup.set(category.slug, category);
      }
    });

    const selectedIds = selectedCategoryIds.map(normalizeId);

    const parentCategoryFromParam =
      activeParents.find((category) => category.slug === selectedParentSlug) || null;

    const selectedCategories = selectedIds
      .map((categoryId) => categoryLookup.get(categoryId))
      .filter(Boolean);

    const selectedParent = selectedCategories.find((category) => !category.parent_id) || null;
    const selectedChild = selectedCategories.find((category) => category.parent_id) || null;
    const inferredParentCategory = selectedChild
      ? activeParents.find((category) => normalizeId(category.id) === normalizeId(selectedChild.parent_id)) || null
      : null;
    const parentCategory = parentCategoryFromParam || selectedParent || inferredParentCategory;

    const implicitParentIds =
      selectedIds.length === 0 && parentCategory
        ? [normalizeId(parentCategory.id)]
        : [];

    const activeCategoryIds = [...selectedIds, ...implicitParentIds];

    if (activeCategoryIds.length > 0) {
      const allowedCategoryIds = new Set();
      const allowedCategorySlugs = new Set();

      activeCategoryIds.forEach((categoryId) => {
        const category = categoryLookup.get(categoryId);
        allowedCategoryIds.add(normalizeId(category?.id || categoryId));

        if (category?.slug) {
          allowedCategorySlugs.add(category.slug);
        } else {
          allowedCategorySlugs.add(categoryId);
        }

        if (category && !category.parent_id) {
          activeChildren
            .filter((child) => normalizeId(child.parent_id) === normalizeId(category.id))
            .forEach((child) => {
              allowedCategoryIds.add(normalizeId(child.id));
              if (child.slug) {
                allowedCategorySlugs.add(child.slug);
              }
            });
        }
      });

      filtered = filtered.filter((product) => {
        const productCategoryIds = [
          product.category_id,
          product.category?.id,
          ...(Array.isArray(product.categories) ? product.categories.map((category) => category?.id) : []),
        ].map(normalizeId).filter(Boolean);

        const productCategorySlugs = [
          product.category_slug,
          product.category?.slug,
          ...(Array.isArray(product.categories) ? product.categories.map((category) => category?.slug) : []),
        ].filter(Boolean);

        return (
          productCategoryIds.some((categoryId) => allowedCategoryIds.has(categoryId)) ||
          productCategorySlugs.some((categorySlug) => allowedCategorySlugs.has(categorySlug))
        );
      });
    }

    if (showOnSale) {
      filtered = filtered.filter((product) => product.is_on_sale);
    }

    if (availabilityFilter === 'in-stock') {
      filtered = filtered.filter((product) => getEffectiveStock(product) > 0);
    } else if (availabilityFilter === 'out-of-stock') {
      filtered = filtered.filter((product) => getEffectiveStock(product) <= 0);
    }

    const minPrice = priceMin === '' ? null : Number(priceMin);
    const maxPrice = priceMax === '' ? null : Number(priceMax);

    if (Number.isFinite(minPrice)) {
      filtered = filtered.filter((product) => getEffectivePrice(product) >= minPrice);
    }

    if (Number.isFinite(maxPrice)) {
      filtered = filtered.filter((product) => getEffectivePrice(product) <= maxPrice);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        (product) =>
          product.name?.toLowerCase().includes(query) ||
          product.description?.toLowerCase().includes(query) ||
          product.short_description?.toLowerCase().includes(query) ||
          product.sku?.toLowerCase().includes(query)
      );
    }

    switch (sortBy) {
      case 'price-low':
        filtered.sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));
        break;
      case 'price-high':
        filtered.sort((a, b) => getEffectivePrice(b) - getEffectivePrice(a));
        break;
      case 'name':
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'newest':
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        break;
      case 'recommended':
        filtered.sort((a, b) => (
          (Number(b.shop_priority) || 0) - (Number(a.shop_priority) || 0) ||
          (Number(a.shop_order) || 0) - (Number(b.shop_order) || 0) ||
          new Date(b.created_at || 0) - new Date(a.created_at || 0)
        ));
        break;
      default:
        break;
    }

    return filtered;
  }, [availabilityFilter, priceMax, priceMin, searchQuery, selectedCategoryIds, selectedParentSlug, showOnSale, sortBy]);

  const fetchShopData = useCallback(async ({
    forceRefresh = false,
    showLoader = true,
    refreshCategories = true,
  } = {}) => {
    const currentRequestId = ++requestSequenceRef.current;

    if (showLoader) {
      setLoading(true);
      setProductsStatus('loading');
    }

    try {
      const productParams = {
        on_sale: showOnSale || undefined,
        featured: showFeatured || undefined,
        bestseller: showBestsellers || undefined,
      };
      const productOptions = forceRefresh ? { forceRefresh: true } : {};
      const categoriesRequest = refreshCategories
        ? getCategories()
        : Promise.resolve(categoriesRef.current);

      const [productResult, categoriesResult] = await Promise.allSettled([
        getProducts(productParams, productOptions),
        categoriesRequest,
      ]);

      if (currentRequestId !== requestSequenceRef.current) {
        return;
      }

      if (categoriesResult.status === 'rejected') {
        console.error('Error fetching categories:', categoriesResult.reason);
      }

      const categoriesForFiltering =
        categoriesResult.status === 'fulfilled'
          ? categoriesResult.value || []
          : categoriesRef.current;

      if (categoriesResult.status === 'fulfilled' && refreshCategories) {
        setCategories(categoriesForFiltering);
      }

      if (productResult.status === 'rejected') {
        console.error('Error fetching products:', productResult.reason);

        if (!showLoader) {
          return;
        }

        setProducts([]);
        setProductsStatus('error');
        return;
      }

      const filtered = filterProductsForView(productResult.value || [], categoriesForFiltering);
      setProducts(filtered);
      setProductsStatus(filtered.length > 0 ? 'success' : 'empty');
    } catch (error) {
      if (currentRequestId !== requestSequenceRef.current) {
        return;
      }

      console.error('Error fetching products:', error);

      if (!showLoader) {
        return;
      }

      setProducts([]);
      setProductsStatus('error');
    } finally {
      if (showLoader && currentRequestId === requestSequenceRef.current) {
        setLoading(false);
      }
    }
  }, [filterProductsForView, showOnSale, showFeatured, showBestsellers]);

  useEffect(() => {
    fetchShopData();
  }, [fetchShopData, retryNonce]);

  const revalidateProducts = useCallback(({ bypassThrottle = false } = {}) => {
    if (document.visibilityState && document.visibilityState !== 'visible') return;
    if (productsStatus === 'loading') return;

    const now = Date.now();
    if (!bypassThrottle && now - lastRevalidationRef.current < SHOP_REVALIDATE_INTERVAL_MS) return;

    lastRevalidationRef.current = now;
    fetchShopData({
      forceRefresh: true,
      showLoader: false,
      refreshCategories: false,
    });
  }, [fetchShopData, productsStatus]);

  useEffect(() => {
    if (!loading && (productsStatus === 'success' || productsStatus === 'empty')) {
      const routeKey = location.key || `${location.pathname}${location.search}`;
      if (routeRevalidationKeyRef.current !== routeKey) {
        routeRevalidationKeyRef.current = routeKey;
        revalidateProducts({ bypassThrottle: true });
      }
    }
  }, [loading, location.key, location.pathname, location.search, productsStatus, revalidateProducts]);

  useEffect(() => {
    const handleReturnToShop = () => {
      revalidateProducts();
    };

    window.addEventListener('focus', handleReturnToShop);
    document.addEventListener('visibilitychange', handleReturnToShop);

    return () => {
      window.removeEventListener('focus', handleReturnToShop);
      document.removeEventListener('visibilitychange', handleReturnToShop);
    };
  }, [revalidateProducts]);

  const updateCategoryParams = (categoryIds, { clearContext = false, keepContext = true } = {}) => {
    const params = new URLSearchParams(searchParams);
    const normalizedCategoryIds = categoryIds.map(normalizeId).filter(Boolean);

    if (normalizedCategoryIds.length > 0) {
      params.set('category', normalizedCategoryIds.join(','));
      params.delete('parent');
    } else {
      params.delete('category');
      if (clearContext || !activeParentCategory) {
        params.delete('parent');
      } else {
        params.set('parent', activeParentCategory.slug);
      }
    }

    if (clearContext) {
      params.delete('parent');
      setSidebarParentSlug('');
      setShouldInferCategoryContext(false);
    } else if (keepContext && activeParentCategory?.slug) {
      setSidebarParentSlug(activeParentCategory.slug);
      setShouldInferCategoryContext(false);
    } else {
      setShouldInferCategoryContext(false);
    }

    skipNextCategoryContextRef.current = true;
    setSelectedCategoryIds(normalizedCategoryIds);
    setSearchParams(params);
  };

  const handleCategoryToggle = (categoryId, checked) => {
    const normalizedCategoryId = normalizeId(categoryId);
    const category = categoryByParam.get(normalizedCategoryId);

    if (checked) {
      const isAlreadySelected = selectedCategoryIds.some((selectedCategoryId) => (
        category ? matchesCategoryParam(category, selectedCategoryId) : normalizeId(selectedCategoryId) === normalizedCategoryId
      ));

      if (!isAlreadySelected) {
        updateCategoryParams([...selectedCategoryIds.map(normalizeId), normalizedCategoryId]);
      }
      return;
    }

    updateCategoryParams(
      selectedCategoryIds.filter((selectedCategoryId) => (
        category ? !matchesCategoryParam(category, selectedCategoryId) : normalizeId(selectedCategoryId) !== normalizedCategoryId
      ))
    );
  };

  const handleSaleToggle = (checked) => {
    const isChecked = checked === true;
    setShowOnSale(isChecked);

    const params = new URLSearchParams(searchParams);
    if (isChecked) {
      params.set('sale', 'true');
    } else {
      params.delete('sale');
    }

    setSearchParams(params);
  };

  const handleAvailabilityChange = (value) => {
    setAvailabilityFilter(value);

    const params = new URLSearchParams(searchParams);
    if (value && value !== 'all') {
      params.set('availability', value);
    } else {
      params.delete('availability');
    }

    setSearchParams(params);
  };

  const handlePriceChange = (key, value) => {
    const setter = key === 'min_price' ? setPriceMin : setPriceMax;
    setter(value);

    const params = new URLSearchParams(searchParams);
    if (value !== '') {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    setSearchParams(params);
  };

  const clearSearch = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('search');
    setSearchQuery('');
    setSearchParams(params);
  };

  const clearFilters = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('category');
    params.delete('sale');
    params.delete('search');
    params.delete('parent');
    params.delete('featured');
    params.delete('bestsellers');
    params.delete('availability');
    params.delete('min_price');
    params.delete('max_price');

    setSelectedCategoryIds([]);
    setSelectedParentSlug('');
    setSidebarParentSlug('');
    setShouldInferCategoryContext(false);
    setShowOnSale(false);
    setShowFeatured(false);
    setShowBestsellers(false);
    setAvailabilityFilter('all');
    setPriceMin('');
    setPriceMax('');
    setSearchQuery('');

    setSearchParams(params);
  };

  const activeFiltersCount =
    selectedCategoryIds.length + (activeParentCategory && selectedCategoryIds.length === 0 ? 1 : 0) +
    (showOnSale ? 1 : 0) + (showFeatured ? 1 : 0) +
    (showBestsellers ? 1 : 0) + (searchQuery ? 1 : 0) +
    (availabilityFilter !== 'all' ? 1 : 0) + (priceMin !== '' ? 1 : 0) + (priceMax !== '' ? 1 : 0);
  const hasActiveFilters = activeFiltersCount > 0;

  const selectedCategoryNames = selectedCategoryIds
    .map((categoryId) => categoryByParam.get(normalizeId(categoryId))?.name)
    .filter(Boolean);

  const pageTitle =
    (showFeatured ? 'Featured Products' : null) ||
    (showBestsellers ? 'Bestsellers' : null) ||
    (selectedCategoryNames.length === 1 ? selectedCategoryNames[0] : null) ||
    (selectedCategoryNames.length > 1 ? `${selectedCategoryNames.length} Categories` : null) ||
    activeParentCategory?.name ||
    'All Products';

  const isCategorySelected = (category) => (
    selectedCategoryIds.some((selectedCategoryId) => matchesCategoryParam(category, selectedCategoryId))
  );

  const CategoryCheckbox = ({ category, className = '', level = 'parent' }) => (
    <label
      className={`flex min-w-0 cursor-pointer items-center gap-3 text-sm transition-colors hover:text-foreground ${
        level === 'parent' ? 'font-medium text-foreground' : 'text-muted-foreground'
      } ${className}`}
      data-testid={`filter-category-${category.id}`}
    >
      <Checkbox
        className="shrink-0"
        checked={isCategorySelected(category)}
        onCheckedChange={(checked) => handleCategoryToggle(category.id, checked === true)}
        data-testid={`filter-category-checkbox-${category.id}`}
      />
      <span className={`min-w-0 truncate ${isCategorySelected(category) ? 'font-medium text-foreground' : ''}`}>
        {category.name}
      </span>
    </label>
  );

  const FilterContent = ({ showClearButton = true } = {}) => (
    <div className="space-y-8">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-heading text-[1.15rem]">
            {activeParentCategory ? `${activeParentCategory.name} Categories` : 'Categories'}
          </h3>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => updateCategoryParams([], { clearContext: true })}
            className={`block max-w-full truncate text-left text-sm transition-colors ${
              selectedCategoryIds.length === 0 && !activeParentCategory ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="filter-all-categories"
          >
            {activeParentCategory ? 'Back to all categories' : 'All Products'}
          </button>

          {visibleCategoryGroups.map((group) => (
            <div key={group.parent.id} className="space-y-2.5 pt-2 first:pt-0">
              <CategoryCheckbox category={group.parent} />
              {group.children.length > 0 && (
                <div className="space-y-2">
                  {group.children.map((category) => (
                    <CategoryCheckbox key={category.id} category={category} className="pl-5" level="child" />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-heading text-[1.15rem] mb-3">Special Offers</h3>
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <Checkbox
            className="shrink-0"
            checked={showOnSale}
            onCheckedChange={handleSaleToggle}
            data-testid="filter-sale-checkbox"
          />
          <span>On Sale</span>
        </label>
      </div>

      <div>
        <h3 className="font-heading text-[1.15rem] mb-3">Availability</h3>
        <Select value={availabilityFilter} onValueChange={handleAvailabilityChange}>
          <SelectTrigger className="w-full" data-testid="availability-filter">
            <SelectValue placeholder="Availability" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Availability</SelectItem>
            <SelectItem value="in-stock">In Stock</SelectItem>
            <SelectItem value="out-of-stock">Out of Stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <h3 className="font-heading text-[1.15rem] mb-3">Price</h3>
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="₹ Min"
            value={priceMin}
            onChange={(event) => handlePriceChange('min_price', event.target.value)}
            data-testid="price-min-filter"
          />
          <Input
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="₹ Max"
            value={priceMax}
            onChange={(event) => handlePriceChange('max_price', event.target.value)}
            data-testid="price-max-filter"
          />
        </div>
      </div>

      {showClearButton && hasActiveFilters && (
        <Button
          variant="outline"
          onClick={clearFilters}
          className="w-full"
          data-testid="clear-filters"
        >
          Clear All Filters
        </Button>
      )}
    </div>
  );

  return (
    <Layout>
      <div className="pt-8 pb-20 min-h-screen md:pt-10" data-testid="shop-page">
        <div className="max-w-[1360px] mx-auto px-5 lg:px-6">
          <div className="mb-8 border-b border-border/70 pb-4">
            <div className="flex items-end justify-between gap-6">
              <div>
                <h1 className="font-heading text-4xl md:text-5xl tracking-tight mb-2">
                  {pageTitle}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {loading ? 'Loading...' : productsStatus === 'error' ? 'Unable to load products' : `${products.length} products`}
                </p>
              </div>

              <div className="hidden lg:block">
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[180px]" data-testid="sort-select">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recommended">Recommended</SelectItem>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="price-low">Price: Low to High</SelectItem>
                    <SelectItem value="price-high">Price: High to Low</SelectItem>
                    <SelectItem value="name">Name: A-Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex gap-6 lg:gap-7 xl:gap-8">
            <aside className="hidden lg:block w-44 xl:w-48 flex-shrink-0">
              <div className="mb-5 flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                <div className="min-w-0">
                  <h2 className="font-heading text-[1.35rem] leading-none">Filters</h2>
                  {hasActiveFilters && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {activeFiltersCount} active
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  disabled={!hasActiveFilters}
                  className="h-8 shrink-0 px-2 text-xs"
                  data-testid="desktop-clear-filters"
                >
                  Clear
                </Button>
              </div>
              <FilterContent showClearButton={false} />
            </aside>

            <div className="flex-1 min-w-0">
              <div className="sticky top-[128px] z-30 -mx-5 mb-4 flex items-center justify-between gap-3 border-y border-border/60 bg-[#F8F5F1] px-5 py-3 shadow-sm lg:hidden">
                <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" className="shrink-0" data-testid="mobile-filters-button">
                      <SlidersHorizontal className="h-4 w-4 mr-2" strokeWidth={1.5} />
                      {hasActiveFilters ? `Filters (${activeFiltersCount})` : 'Filters'}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="flex h-full w-full max-w-[380px] flex-col overflow-hidden bg-[#F8F5F1] p-0">
                    <SheetHeader className="shrink-0 border-b border-border/70 px-5 py-4 pr-12 text-left">
                      <SheetTitle className="font-heading text-2xl">
                        Filters
                        {hasActiveFilters && (
                          <span className="ml-2 align-middle text-sm font-normal text-muted-foreground">
                            ({activeFiltersCount})
                          </span>
                        )}
                      </SheetTitle>
                    </SheetHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-6">
                      <FilterContent showClearButton={false} />
                    </div>
                    <div className="shrink-0 border-t border-border/70 bg-[#F8F5F1] px-5 py-4">
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          variant="outline"
                          onClick={clearFilters}
                          disabled={!hasActiveFilters}
                          className={!hasActiveFilters ? 'opacity-60' : ''}
                          data-testid="mobile-clear-filters"
                        >
                          Clear All
                        </Button>
                        <SheetClose asChild>
                          <Button data-testid="mobile-apply-filters">
                            Apply Filters
                          </Button>
                        </SheetClose>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>

                <div className="min-w-0 flex-1">
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="ml-auto w-full max-w-[170px]" data-testid="sort-select-mobile">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recommended">Recommended</SelectItem>
                      <SelectItem value="newest">Newest</SelectItem>
                      <SelectItem value="price-low">Price: Low to High</SelectItem>
                      <SelectItem value="price-high">Price: High to Low</SelectItem>
                      <SelectItem value="name">Name: A-Z</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="hidden lg:flex items-center gap-2 flex-wrap mb-4">
                {searchQuery && (
                  <span className="inline-flex items-center gap-1 bg-sage/30 text-sm px-3 py-1 rounded-full">
                    Search: {searchQuery}
                    <button onClick={clearSearch} data-testid="remove-search-filter" aria-label="Remove search filter">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}

                {activeParentCategory && selectedCategoryIds.length === 0 && (
                  <span className="inline-flex items-center gap-1 bg-clay/20 text-sm px-3 py-1 rounded-full">
                    {activeParentCategory.name}
                  </span>
                )}

                {selectedCategoryIds.map((categoryId) => {
                  const category = categoryByParam.get(normalizeId(categoryId));
                  if (!category) return null;

                  return (
                    <span key={categoryId} className="inline-flex items-center gap-1 bg-clay/30 text-sm px-3 py-1 rounded-full">
                      {category.name}
                      <button
                        onClick={() => handleCategoryToggle(categoryId, false)}
                        data-testid={`remove-category-filter-${categoryId}`}
                        aria-label={`Remove ${category.name} filter`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}

                {showOnSale && (
                  <span className="inline-flex items-center gap-1 bg-terracotta/20 text-terracotta text-sm px-3 py-1 rounded-full">
                    On Sale
                    <button onClick={() => handleSaleToggle(false)} data-testid="remove-sale-filter" aria-label="Remove sale filter">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}

                {availabilityFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 bg-sage/30 text-sm px-3 py-1 rounded-full">
                    {availabilityFilter === 'in-stock' ? 'In Stock' : 'Out of Stock'}
                    <button onClick={() => handleAvailabilityChange('all')} data-testid="remove-availability-filter" aria-label="Remove availability filter">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}

                {priceMin !== '' && (
                  <span className="inline-flex items-center gap-1 bg-clay/20 text-sm px-3 py-1 rounded-full">
                    Min ₹{priceMin}
                    <button onClick={() => handlePriceChange('min_price', '')} data-testid="remove-min-price-filter" aria-label="Remove minimum price filter">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}

                {priceMax !== '' && (
                  <span className="inline-flex items-center gap-1 bg-clay/20 text-sm px-3 py-1 rounded-full">
                    Max ₹{priceMax}
                    <button onClick={() => handlePriceChange('max_price', '')} data-testid="remove-max-price-filter" aria-label="Remove maximum price filter">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>

              {loading && productsStatus === 'loading' ? (
                <MarisoLoader label="Loading products..." />
              ) : productsStatus === 'error' ? (
                <div className="py-16 text-center">
                  <p className="mb-4 text-muted-foreground">Unable to load products right now.</p>
                  <Button
                    onClick={() => {
                      setRetryNonce((current) => current + 1);
                    }}
                    variant="outline"
                    data-testid="retry-products-empty"
                  >
                    Retry
                  </Button>
                </div>
              ) : productsStatus === 'empty' ? (
                <div className="text-center py-16">
                  <p className="text-muted-foreground mb-4">
                    {searchQuery ? `No products found for "${searchQuery}"` : 'No products available'}
                  </p>
                  <Button onClick={clearFilters} variant="outline" data-testid="clear-filters-empty">
                    Clear Filters
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-5 md:grid-cols-2 lg:grid-cols-3 xl:gap-6">
                  {products.map((product) => (
                    <ProductCard key={product.id} product={product} testIdPrefix="shop" />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ShopPage;
