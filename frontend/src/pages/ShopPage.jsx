import React, { useState, useEffect } from 'react';
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
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [sortBy, setSortBy] = useState('newest');
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || '');
  const [showOnSale, setShowOnSale] = useState(searchParams.get('sale') === 'true');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [prods, cats] = await Promise.all([
          getProducts({
            category_id: selectedCategory || undefined,
            on_sale: showOnSale || undefined
          }),
          getCategories()
        ]);

        let sorted = [...prods];
        switch (sortBy) {
          case 'price-low':
            sorted.sort((a, b) => (a.sale_price || a.price) - (b.sale_price || b.price));
            break;
          case 'price-high':
            sorted.sort((a, b) => (b.sale_price || b.price) - (a.sale_price || a.price));
            break;
          case 'name':
            sorted.sort((a, b) => a.name.localeCompare(b.name));
            break;
          default:
            sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        if (searchQuery.trim()) {
          const query = searchQuery.trim().toLowerCase();
          sorted = sorted.filter((product) =>
            product.name?.toLowerCase().includes(query) ||
            product.description?.toLowerCase().includes(query) ||
            product.short_description?.toLowerCase().includes(query) ||
            product.sku?.toLowerCase().includes(query)
          );
        }

        setProducts(sorted);
        setCategories(cats);
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedCategory, showOnSale, sortBy, searchQuery]);

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
    setSearchInput('');
    setSearchQuery('');
    setSearchParams(params);
  };

  const clearFilters = () => {
    setSelectedCategory('');
    setShowOnSale(false);
    setSortBy('newest');
    setSearchInput('');
    setSearchQuery('');
    setSearchParams({});
  };

  const activeFiltersCount = (selectedCategory ? 1 : 0) + (showOnSale ? 1 : 0) + (searchQuery ? 1 : 0);

  const FilterContent = () => (
    <div className="space-y-8">
      <div>
        <h3 className="font-heading text-lg mb-4">Categories</h3>
        <div className="space-y-3">
          <button
            onClick={() => handleCategoryChange('')}
            className={`block text-sm transition-colors ${
              !selectedCategory ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="filter-all-categories"
          >
            All Products
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => handleCategoryChange(category.id)}
              className={`block text-sm transition-colors ${
                selectedCategory === category.id ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`filter-category-${category.id}`}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-heading text-lg mb-4">Special Offers</h3>
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

  const selectedCategoryName = categories.find(c => c.id === selectedCategory)?.name;

  return (
    <Layout>
      <div className="pt-32 pb-24 min-h-screen" data-testid="shop-page">
        <div className="max-w-[1440px] mx-auto container-padding">
          <div className="mb-12 space-y-6">
            <div>
              <h1 className="font-heading text-4xl md:text-5xl tracking-tight mb-4">
                {selectedCategoryName || 'All Products'}
              </h1>
              <p className="text-muted-foreground">
                {loading ? 'Loading...' : `${products.length} products`}
              </p>
            </div>
          </div>

          <div className="flex gap-12">
            <aside className="hidden lg:block w-64 flex-shrink-0">
              <FilterContent />
            </aside>

            <div className="flex-1">
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-border">
                <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" className="lg:hidden" data-testid="mobile-filters-button">
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

                <div className="hidden lg:flex items-center gap-2 flex-wrap">
                  {searchQuery && (
                    <span className="inline-flex items-center gap-1 bg-sage/30 text-sm px-3 py-1 rounded-full">
                      Search: {searchQuery}
                      <button onClick={clearSearch} data-testid="remove-search-filter">
                        <X className="h-3 w-3" />
                      </button>
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

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
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
