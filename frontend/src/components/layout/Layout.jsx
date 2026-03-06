import React from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { Toaster } from '../ui/sonner';

export const Layout = ({ children, hideFooter = false }) => {
  return (
    <div className="min-h-screen flex flex-col bg-[#F8F5F1]">
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
      {!hideFooter && <Footer />}
      <Toaster position="bottom-right" />
    </div>
  );
};

export default Layout;
