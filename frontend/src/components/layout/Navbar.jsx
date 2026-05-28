import React, { forwardRef, useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { searchCatalogSuggestions, getCategories, getHomepageContent } from '../../lib/api';
import { createHomePageAdminDefaults } from '../../lib/homePageDefaults';
import { getProductPath } from '../../lib/utils';

const getSafeAnnouncementLink = (value) => {
  const normalized = String(value || '').trim();
  if (
    (normalized.startsWith('/') && !normalized.startsWith('//')) ||
    normalized.startsWith('#') ||
    /^https?:\/\//i.test(normalized)
  ) {
    return normalized;
  }
  return null;
};

export const Navbar = forwardRef((props, ref) => {
  const announcementDefaults = useMemo(() => createHomePageAdminDefaults().announcement, []);
  const [scrolled, setScrolled] = useState(() => (typeof window === 'undefined' ? false : window.scrollY > 40));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [navCategories, setNavCategories] = useState([]);
  const [announcement, setAnnouncement] = useState(announcementDefaults);
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
    const updateScrolled = () => {
      setScrolled(window.scrollY > 40);
    };

    const handleScroll = () => {
      updateScrolled();
      if (searchOpen || mobileSearchOpen) {
        closeSearch();
      }
    };

    updateScrolled();
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

  const isAdminRoute = location.pathname.startsWith('/admin');

  useEffect(() => {
    if (isAdminRoute) {
      return undefined;
    }

    let cancelled = false;
    getHomepageContent()
      .then((content) => {
        if (!cancelled) {
          setAnnouncement({
            ...announcementDefaults,
            ...(content?.announcement || {}),
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAnnouncement(announcementDefaults);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [announcementDefaults, isAdminRoute]);

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
        const results = await searchCatalogSuggestions(query);
        if (searchRequestIdRef.current === requestId) {
          setSearchResults(results);
        }
      } catch (error) {
        console.error('Failed to search catalog:', error);
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
  const categorySearchResults = searchResults.filter((suggestion) => suggestion.type === 'category');
  const productSearchResults = searchResults.filter((suggestion) => suggestion.type === 'product');

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

  const handleSuggestionClick = (suggestion) => {
    closeSearch();

    if (suggestion.type === 'category') {
      if (suggestion.parent_id) {
        navigate(`/shop?category=${encodeURIComponent(suggestion.id)}`);
      } else {
        navigate(`/shop?parent=${encodeURIComponent(suggestion.slug)}`);
      }
      return;
    }

    const productPath = getProductPath(suggestion);
    if (productPath) {
      navigate(productPath);
    }
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
  const hasHeaderDepth = scrolled || !isHomePage || mobileMenuOpen || searchOpen || mobileSearchOpen;
  const navBg = `bg-[#F8F5F1]/95 backdrop-blur-md border-b border-border/50 ${
    hasHeaderDepth ? 'shadow-[0_8px_24px_rgba(36,28,24,0.06)]' : ''
  }`;
  const announcementText = String(announcement?.announcement_text || '').trim();
  const announcementLink = getSafeAnnouncementLink(announcement?.announcement_link);
  const showAnnouncement = !isAdminRoute && announcement?.announcement_enabled !== false && announcementText;
  const announcementStyle = {
    backgroundColor: announcement?.announcement_bg_color || announcementDefaults.announcement_bg_color,
    color: announcement?.announcement_text_color || announcementDefaults.announcement_text_color,
  };
  const announcementClassName = 'block w-full px-4 py-2 text-center text-[11px] font-medium uppercase tracking-[0.14em] sm:text-xs';
  const isExternalAnnouncementLink = /^https?:\/\//i.test(announcementLink || '');
  const AnnouncementWrapper = announcementLink ? (isExternalAnnouncementLink ? 'a' : Link) : 'div';
  const announcementProps = announcementLink
    ? isExternalAnnouncementLink
      ? { href: announcementLink, target: '_blank', rel: 'noopener noreferrer' }
      : { to: announcementLink }
    : {};

  const renderSuggestionGroups = (testIdPrefix) => (
    <>
      {categorySearchResults.length > 0 && (
        <div>
          <div className="px-4 pt-3 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Categories
          </div>
          {categorySearchResults.map((suggestion) => (
            <button
              key={`category-${suggestion.id}`}
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
              onClick={() => handleSuggestionClick(suggestion)}
              data-testid={`${testIdPrefix}-${suggestion.id}`}
            >
              <div className="font-medium text-foreground">{suggestion.name}</div>
            </button>
          ))}
        </div>
      )}
      {productSearchResults.length > 0 && (
        <div className={categorySearchResults.length > 0 ? 'border-t border-border' : ''}>
          <div className="px-4 pt-3 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Products
          </div>
          {productSearchResults.map((suggestion) => (
            <button
              key={`product-${suggestion.id}`}
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
              onClick={() => handleSuggestionClick(suggestion)}
              data-testid={`${testIdPrefix}-${suggestion.id}`}
            >
              <div className="font-medium text-foreground">{suggestion.name}</div>
            </button>
          ))}
        </div>
      )}
    </>
  );

  return (
    <nav
      ref={ref}
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${navBg}`}
      data-testid="navbar"
    >
      {showAnnouncement ? (
        <AnnouncementWrapper
          {...announcementProps}
          className={`${announcementClassName} ${announcementLink ? 'transition-opacity hover:opacity-90' : ''}`}
          style={announcementStyle}
          data-testid="announcement-banner"
        >
          {announcementText}
        </AnnouncementWrapper>
      ) : null}
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
                    aria-label="Search products and categories"
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
                    No matching results found.
                  </div>
                )}

                {!searchLoading && searchResults.length > 0 && (
                  <div className="absolute top-full right-0 mt-2 w-full rounded-lg border border-border bg-background overflow-hidden shadow-lg z-50">
                    {renderSuggestionGroups('navbar-inline-search-result')}
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
              aria-label={searchOpen ? 'Close search' : 'Open search'}
            >
              {searchOpen ? <X className="h-5 w-5" strokeWidth={1.5} /> : <Search className="h-5 w-5" strokeWidth={1.5} />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              data-testid="mobile-search-button"
              onClick={() => setMobileSearchOpen(true)}
              aria-label="Open search"
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
                  aria-label="View wishlist"
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
                aria-label="View cart"
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
                    aria-label="Open account menu"
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
                  aria-label="Sign in"
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
                  aria-label="Open navigation menu"
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
            <DialogTitle>Search products and categories</DialogTitle>
            <DialogDescription>
              Search by category, product name, or keyword.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                autoFocus
                aria-label="Search products and categories"
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
                No matching results found.
              </div>
            )}

            {!searchLoading && searchResults.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                {renderSuggestionGroups('navbar-search-result')}
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
});

Navbar.displayName = 'Navbar';

export default Navbar;
