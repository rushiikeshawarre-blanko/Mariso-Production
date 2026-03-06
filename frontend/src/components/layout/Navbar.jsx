import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingBag, User, Menu, X, Search, Heart } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet';

export const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { getCartCount } = useCart();
  const { user, logout, isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Shop', href: '/shop' },
    { name: 'Candles', href: '/shop?category=container-candles' },
    { name: 'Homewares', href: '/shop?category=coasters' },
    { name: 'Gifts', href: '/shop?category=bouquets' },
  ];

  const handleLogout = () => {
    logout();
    navigate('/');
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
          <div className="hidden md:flex items-center gap-8">
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
          <div className="flex items-center gap-4">
            {/* Search - Hidden on mobile */}
            <Button 
              variant="ghost" 
              size="icon" 
              className="hidden md:flex"
              data-testid="search-button"
            >
              <Search className="h-5 w-5" strokeWidth={1.5} />
            </Button>

            {/* Wishlist */}
            {isAuthenticated() && (
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
            {isAuthenticated() ? (
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
                  className="md:hidden"
                  data-testid="mobile-menu-button"
                >
                  <Menu className="h-5 w-5" strokeWidth={1.5} />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:w-[400px] bg-[#F8F5F1]">
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
                    {!isAuthenticated() && (
                      <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                        <Button className="w-full btn-primary" data-testid="mobile-login-button">
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
    </nav>
  );
};

export default Navbar;
