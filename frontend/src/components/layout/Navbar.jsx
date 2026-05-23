import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingBag, User, Menu, X, Search, Heart } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth0 } from '@auth0/auth0-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { searchProducts, getCategories } from '../../lib/api';

export const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [navCategories, setNavCategories] = useState([]);
  const desktopSearchPanelRef = useRef(null);
  const desktopSearchButtonRef = useRef(null);
  const searchRequestIdRef = useRef(0);
  const { getCartCount } = useCart();
  const {
    user,
    isAuthenticated,
    logout: auth0Logout,
  } = useAuth0();
  const navigate = useNavigate();
  const location = useLocation();
  const adminEmails = ["mariso.store@gmail.com"];
  const isAdmin = () => adminEmails.includes((user?.email || "").toLowerCase());

  const closeSearch = useCallback(() => {
    searchRequestIdRef.current += 1;
    setSearchOpen(false);
    setMobileSearchOpen(false);
    setSearchInput('');
    setSearchResults([]);
    setSearchLoading(false);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
      if (searchOpen || mobileSearchOpen) {
        closeSearch();
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [closeSearch, mobileSearchOpen, searchOpen]);

  useEffect(() => {
    if (!searchOpen) return undefined;

    const handlePointerDown = (event) => {
      const clickedPanel = desktopSearchPanelRef.current?.contains(event.target);
      const clickedButton = desktopSearchButtonRef.current?.contains(event.target);

      if (!clickedPanel && !clickedButton) {
        closeSearch();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeSearch();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeSearch, searchOpen]);

  useEffect(() => {
    const fetchNavCategories = async () => {
      try {
        const categories = await getCategories();
        const topLevelNavCategories = categories
          .filter((category) => !category.parent_id && category.show_in_nav && category.is_active !== false)
          .sort((a, b) => ((a.sort_order || 0) - (b.sort_order || 0)) || a.name.localeCompare(b.name));

        setNavCategories(topLevelNavCategories);
      } catch (error) {
        console.error('Failed to fetch navigation categories:', error);
        setNavCategories([]);
      }
    };

    fetchNavCategories();
  }, []);

  useEffect(() => {
    const query = searchInput.trim();
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;

    if ((!searchOpen && !mobileSearchOpen) || !query) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      if (searchRequestIdRef.current !== requestId) return;

      try {
        setSearchLoading(true);
        const results = await searchProducts(query);
        if (searchRequestIdRef.current === requestId) {
          setSearchResults(results);
        }
      } catch (error) {
        console.error('Failed to search products:', error);
        if (searchRequestIdRef.current === requestId) {
          setSearchResults([]);
        }
      } finally {
        if (searchRequestIdRef.current === requestId) {
          setSearchLoading(false);
        }
      }
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [searchInput, searchOpen, mobileSearchOpen]);

  const navLinks = [
    { name: 'Shop', href: '/shop' },
    ...navCategories.map((category) => ({
      name: category.name,
      href: `/shop?parent=${encodeURIComponent(category.slug)}`,
    })),
  ];

  const handleLogout = () => {
    auth0Logout({
      logoutParams: {
        returnTo: window.location.origin,
      },
    });
  };

  const handleSearchSubmit = () => {
    const query = searchInput.trim();
    if (!query) return;

    closeSearch();
    navigate(`/shop?search=${encodeURIComponent(query)}`);
  };

  const handleSuggestionClick = (productId) => {
    closeSearch();
    navigate(`/product/${productId}`);
  };

  const handleMobileSearchOpenChange = (open) => {
    if (open) {
      setMobileSearchOpen(true);
    } else {
      closeSearch();
    }
  };

  const toggleDesktopSearch = () => {
    if (searchOpen) {
      closeSearch();
      return;
    }

    setSearchOpen(true);
  };

  const isHomePage = location.pathname === '/';
  const navBg = scrolled || !isHomePage 
    ? 'bg-[#F8F5F1]/95 backdrop-blur-md border-b border-border/50' 
    : 'bg-transparent';

  return (
    <nav 
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${navBg}`}
      data-testid="navbar"
    >
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-12">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link 
            to="/" 
            className="font-heading text-2xl md:text-3xl tracking-tight text-foreground"
            data-testid="navbar-logo"
          >
            Mariso
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-8 flex-1 justify-center">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.href}
                className="nav-link"
                data-testid={`nav-link-${link.name.toLowerCase()}`}
              >
                {link.name}
              </Link>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 relative">
            {searchOpen && (
              <div
                ref={desktopSearchPanelRef}
                className="hidden lg:block absolute right-full mr-2 top-1/2 -translate-y-1/2 w-[320px] xl:w-[360px] z-40"
                data-testid="desktop-search-panel"
              >
                <div className="flex items-center gap-2 rounded-lg bg-background/95 backdrop-blur-sm">
                  <Input
                    autoFocus
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSearchSubmit();
                      }
                    }}
                    placeholder="Search candles, homewares, or gifts"
                    data-testid="navbar-inline-search-input"
                  />
                  <Button onClick={handleSearchSubmit} data-testid="navbar-inline-search-submit">
                    Search
                  </Button>
                </div>

                {searchLoading && (
                  <div className="absolute top-full right-0 mt-2 w-full rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground shadow-lg z-50">
                    Searching...
                  </div>
                )}

                {!searchLoading && searchInput.trim() && searchResults.length === 0 && (
                  <div className="absolute top-full right-0 mt-2 w-full rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground shadow-lg z-50">
                    No matching products found.
                  </div>
                )}

                {!searchLoading && searchResults.length > 0 && (
                  <div className="absolute top-full right-0 mt-2 w-full rounded-lg border border-border bg-background divide-y divide-border overflow-hidden shadow-lg z-50">
                    {searchResults.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                        onClick={() => handleSuggestionClick(product.id)}
                        data-testid={`navbar-inline-search-result-${product.id}`}
                      >
                        <div className="font-medium text-foreground">{product.name}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Search - Hidden on mobile */}
            <Button 
              ref={desktopSearchButtonRef}
              variant="ghost" 
              size="icon" 
              className="hidden lg:flex"
              data-testid="search-button"
              onClick={toggleDesktopSearch}
            >
              {searchOpen ? <X className="h-5 w-5" strokeWidth={1.5} /> : <Search className="h-5 w-5" strokeWidth={1.5} />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              data-testid="mobile-search-button"
              onClick={() => setMobileSearchOpen(true)}
            >
              <Search className="h-5 w-5" strokeWidth={1.5} />
            </Button>

            {/* Wishlist */}
            {isAuthenticated && (
              <Link to="/account/wishlist">
                <Button 
                  variant="ghost" 
                  size="icon"
                  data-testid="wishlist-button"
                >
                  <Heart className="h-5 w-5" strokeWidth={1.5} />
                </Button>
              </Link>
            )}

            {/* Cart */}
            <Link to="/cart" className="relative">
              <Button 
                variant="ghost" 
                size="icon"
                data-testid="cart-button"
              >
                <ShoppingBag className="h-5 w-5" strokeWidth={1.5} />
                {getCartCount() > 0 && (
                  <span className="cart-badge" data-testid="cart-count">
                    {getCartCount()}
                  </span>
                )}
              </Button>
            </Link>

            {/* User Menu */}
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    data-testid="user-menu-button"
                  >
                    <User className="h-5 w-5" strokeWidth={1.5} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/account" data-testid="menu-account">My Account</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/account/orders" data-testid="menu-orders">Orders</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/account/wishlist" data-testid="menu-wishlist">Wishlist</Link>
                  </DropdownMenuItem>
                  {isAdmin() && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link to="/admin" data-testid="menu-admin">Admin Dashboard</Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} data-testid="menu-logout">
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to="/login">
                <Button 
                  variant="ghost" 
                  size="icon"
                  data-testid="login-button"
                >
                  <User className="h-5 w-5" strokeWidth={1.5} />
                </Button>
              </Link>
            )}

            {/* Mobile Menu */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="lg:hidden"
                  data-testid="mobile-menu-button"
                >
                  <Menu className="h-5 w-5" strokeWidth={1.5} />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full overflow-y-auto bg-[#F8F5F1] sm:w-[400px]">
                <div className="flex flex-col h-full pt-8">
                  <div className="flex flex-col gap-6">
                    {navLinks.map((link) => (
                      <Link
                        key={link.name}
                        to={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="text-2xl font-heading text-foreground hover:text-foreground/70 transition-colors"
                        data-testid={`mobile-nav-${link.name.toLowerCase()}`}
                      >
                        {link.name}
                      </Link>
                    ))}
                  </div>
                  <div className="mt-auto pb-8">
                    {!isAuthenticated && (
                      <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                        <Button
                          className="w-full btn-primary"
                          data-testid="mobile-login-button"
                        >
                          Sign In
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
      <Dialog open={mobileSearchOpen} onOpenChange={handleMobileSearchOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Search products</DialogTitle>
            <DialogDescription>
              Search by product name, description, or SKU.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                autoFocus
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearchSubmit();
                  }
                }}
                placeholder="Search candles, homewares, or gifts"
                data-testid="navbar-search-input"
              />
              <Button onClick={handleSearchSubmit} data-testid="navbar-search-submit">
                Search
              </Button>
            </div>

            {searchLoading && (
              <p className="text-sm text-muted-foreground">Searching...</p>
            )}

            {!searchLoading && searchInput.trim() && searchResults.length === 0 && (
              <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                No matching products found.
              </div>
            )}

            {!searchLoading && searchResults.length > 0 && (
              <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                {searchResults.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                    onClick={() => handleSuggestionClick(product.id)}
                    data-testid={`navbar-search-result-${product.id}`}
                  >
                    <div className="font-medium text-foreground">{product.name}</div>
                  </button>
                ))}
              </div>
            )}

            {searchInput.trim() && (
              <div className="pt-2 border-t border-border">
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={handleSearchSubmit}
                  data-testid="navbar-search-view-all"
                >
                  View all results for “{searchInput.trim()}”
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </nav>
  );
};

export default Navbar;
