import React, { useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { Toaster } from '../ui/sonner';

const DEFAULT_HEADER_HEIGHT = 112;

export const Layout = ({ children, hideFooter = false, headerOffset = true }) => {
  const location = useLocation();
  const navbarRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(DEFAULT_HEADER_HEIGHT);
  const isHomeRoute = location.pathname === '/';
  const isAdminRoute = location.pathname.startsWith('/admin');
  const shouldOffsetHeader = headerOffset && !isHomeRoute && !isAdminRoute;

  useLayoutEffect(() => {
    const navbar = navbarRef.current;
    if (!navbar || !shouldOffsetHeader) {
      return undefined;
    }

    const syncHeaderHeight = () => {
      setHeaderHeight(Math.ceil(navbar.getBoundingClientRect().height));
    };

    syncHeaderHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncHeaderHeight);
      return () => window.removeEventListener('resize', syncHeaderHeight);
    }

    const resizeObserver = new ResizeObserver(syncHeaderHeight);
    resizeObserver.observe(navbar);

    return () => resizeObserver.disconnect();
  }, [shouldOffsetHeader]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F5F1]">
      <Navbar ref={navbarRef} />
      <main
        className="flex-1"
        style={shouldOffsetHeader ? { paddingTop: `${headerHeight}px` } : undefined}
      >
        {children}
      </main>
      {!hideFooter && <Footer />}
      <Toaster position="bottom-right" />
    </div>
  );
};

export default Layout;
