import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { ProductCard } from '../components/products/ProductCard';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../components/ui/sheet';
import { SlidersHorizontal, X } from 'lucide-react';
import { getProducts, getCategories } from '../lib/api';

const ShopPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [sortBy, setSortBy] = useState('newest');
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || '');
  const [selectedParentSlug, setSelectedParentSlug] = useState(searchParams.get('parent') || '');
  const [showOnSale, setShowOnSale] = useState(searchParams.get('sale') === 'true');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    setSearchQuery(searchParams.get('search') || '');
    setSelectedCategory(searchParams.get('category') || '');
    setSelectedParentSlug(searchParams.get('parent') || '');
    setShowOnSale(searchParams.get('sale') === 'true');
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

  const selectedParentCategory = useMemo(() => {
    if (!selectedParentSlug) return null;
    return parentCategories.find((category) => category.slug === selectedParentSlug) || null;
  }, [parentCategories, selectedParentSlug]);

  const selectedParentChildren = useMemo(() => {
    if (!selectedParentCategory) return [];
    return childCategories.filter(
      (category) => category.parent_id === selectedParentCategory.id
    );
  }, [childCategories, selectedParentCategory]);

  const groupedChildCategories = useMemo(() => {
    return parentCategories
      .map((parent) => ({
        parent,
        children: childCategories.filter((category) => category.parent_id === parent.id),
      }))
      .filter((group) => group.children.length > 0);
  }, [parentCategories, childCategories]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      try {
        const [productResult, categoriesResult] = await Promise.allSettled([
          getProducts({
            on_sale: showOnSale || undefined,
          }),
          getCategories(),
        ]);

        if (productResult.status === 'rejected') {
          console.error('Error fetching products:', productResult.reason);
        }

        if (categoriesResult.status === 'rejected') {
          console.error('Error fetching categories:', categoriesResult.reason);
        }

        if (categoriesResult.status === 'fulfilled') {
          setCategories(categoriesResult.value || []);
        }

        if (productResult.status === 'fulfilled') {
          const allProducts = productResult.value || [];
          const categoriesForFiltering =
            categoriesResult.status === 'fulfilled' ? categoriesResult.value || [] : [];

          let filtered = [...allProducts];

          const activeParents = categoriesForFiltering.filter(
            (category) => !category.parent_id && category.is_active !== false
          );
          const activeChildren = categoriesForFiltering.filter(
            (category) => category.parent_id && category.is_active !== false
          );

          const parentCategory =
            activeParents.find((category) => category.slug === selectedParentSlug) || null;

          const parentChildIds = parentCategory
            ? activeChildren
                .filter((category) => category.parent_id === parentCategory.id)
                .map((category) => category.id)
            : [];

          if (selectedCategory) {
            filtered = filtered.filter(
              (product) => product.category_id === selectedCategory
            );
          } else if (parentCategory) {
            filtered = filtered.filter((product) =>
              parentChildIds.includes(product.category_id)
            );
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

          const getEffectivePrice = (product) => {
            const hasSalePrice = product.is_on_sale && product.discount_price != null;
            return Number(hasSalePrice ? product.discount_price : product.price) || 0;
          };

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
            default:
              filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          }

          setProducts(filtered);
        }
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedCategory, selectedParentSlug, showOnSale, sortBy, searchQuery]);

  const handleCategoryChange = (categoryId) => {
    setSelectedCategory(categoryId);

    const params = new URLSearchParams(searchParams);

    if (categoryId) {
      params.set('category', categoryId);
    } else {
      params.delete('category');
    }

    setSearchParams(params);
  };

  const handleSaleToggle = (checked) => {
    setShowOnSale(checked);

    const params = new URLSearchParams(searchParams);
    if (checked) {
      params.set('sale', 'true');
    } else {
      params.delete('sale');
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

    setSelectedCategory('');
    setSelectedParentSlug('');
    setShowOnSale(false);
    setSortBy('newest');
    setSearchQuery('');

    setSearchParams(params);
  };

  const activeFiltersCount =
    (selectedCategory ? 1 : 0) + (showOnSale ? 1 : 0) + (searchQuery ? 1 : 0);

  const selectedCategoryName = categories.find(
    (category) => category.id === selectedCategory
  )?.name;

  const pageTitle =
    selectedCategoryName ||
    selectedParentCategory?.name ||
    'All Products';


  const FilterContent = () => (
    <div className="space-y-7">
      <div>
        <h3 className="font-heading text-[1.55rem] mb-4">
          {selectedParentCategory ? `${selectedParentCategory.name} Categories` : 'Categories'}
        </h3>

        <div className="space-y-2.5">
          <button
            onClick={() => handleCategoryChange('')}
            className={`block text-sm transition-colors ${
              !selectedCategory ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="filter-all-categories"
          >
            {selectedParentCategory ? `All ${selectedParentCategory.name}` : 'All Products'}
          </button>

          {selectedParentCategory ? (
            selectedParentChildren.map((category) => (
              <button
                key={category.id}
                onClick={() => handleCategoryChange(category.id)}
                className={`block text-sm transition-colors ${
                  selectedCategory === category.id
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                data-testid={`filter-category-${category.id}`}
              >
                {category.name}
              </button>
            ))
          ) : (
            groupedChildCategories.map((group) => (
              <div key={group.parent.id} className="space-y-2 pt-2 first:pt-0">
                <p className="text-sm font-medium text-foreground">{group.parent.name}</p>
                <div className="space-y-2 pl-3">
                  {group.children.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => handleCategoryChange(category.id)}
                      className={`block text-sm transition-colors ${
                        selectedCategory === category.id
                          ? 'text-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      data-testid={`filter-category-${category.id}`}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <h3 className="font-heading text-[1.55rem] mb-4">Special Offers</h3>
        <label className="flex items-center gap-3 cursor-pointer">
          <Checkbox
            checked={showOnSale}
            onCheckedChange={handleSaleToggle}
            data-testid="filter-sale-checkbox"
          />
          <span className="text-sm">On Sale</span>
        </label>
      </div>

      {activeFiltersCount > 0 && (
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
      <div className="pt-24 pb-20 min-h-screen" data-testid="shop-page">
        <div className="max-w-[1360px] mx-auto px-5 lg:px-6">
          <div className="mb-8 border-b border-border/70 pb-4">
            <div className="flex items-end justify-between gap-6">
              <div>
                <h1 className="font-heading text-4xl md:text-5xl tracking-tight mb-2">
                  {pageTitle}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {loading ? 'Loading...' : `${products.length} products`}
                </p>
              </div>

              <div className="hidden lg:block">
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[180px]" data-testid="sort-select">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
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
              <FilterContent />
            </aside>

            <div className="flex-1">
              <div className="flex items-center justify-between mb-4 lg:hidden">
                <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" data-testid="mobile-filters-button">
                      <SlidersHorizontal className="h-4 w-4 mr-2" strokeWidth={1.5} />
                      Filters
                      {activeFiltersCount > 0 && (
                        <span className="ml-2 bg-terracotta text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                          {activeFiltersCount}
                        </span>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[300px] bg-[#F8F5F1]">
                    <SheetHeader>
                      <SheetTitle className="font-heading text-xl">Filters</SheetTitle>
                    </SheetHeader>
                    <div className="mt-8">
                      <FilterContent />
                    </div>
                  </SheetContent>
                </Sheet>

                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[180px]" data-testid="sort-select-mobile">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="price-low">Price: Low to High</SelectItem>
                    <SelectItem value="price-high">Price: High to Low</SelectItem>
                    <SelectItem value="name">Name: A-Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="hidden lg:flex items-center gap-2 flex-wrap mb-4">
                {searchQuery && (
                  <span className="inline-flex items-center gap-1 bg-sage/30 text-sm px-3 py-1 rounded-full">
                    Search: {searchQuery}
                    <button onClick={clearSearch} data-testid="remove-search-filter">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}

                {selectedParentCategory && !selectedCategory && (
                  <span className="inline-flex items-center gap-1 bg-clay/20 text-sm px-3 py-1 rounded-full">
                    {selectedParentCategory.name}
                  </span>
                )}

                {selectedCategory && (
                  <span className="inline-flex items-center gap-1 bg-clay/30 text-sm px-3 py-1 rounded-full">
                    {selectedCategoryName}
                    <button onClick={() => handleCategoryChange('')} data-testid="remove-category-filter">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}

                {showOnSale && (
                  <span className="inline-flex items-center gap-1 bg-terracotta/20 text-terracotta text-sm px-3 py-1 rounded-full">
                    On Sale
                    <button onClick={() => handleSaleToggle(false)} data-testid="remove-sale-filter">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 xl:gap-6">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="space-y-4">
                      <div className="aspect-[3/4] bg-muted rounded-lg animate-pulse" />
                      <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
                      <div className="h-6 bg-muted rounded w-3/4 animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-muted-foreground mb-4">
                    {searchQuery ? `No products found for "${searchQuery}"` : 'No products found'}
                  </p>
                  <Button onClick={clearFilters} variant="outline" data-testid="clear-filters-empty">
                    Clear Filters
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 xl:gap-6">
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