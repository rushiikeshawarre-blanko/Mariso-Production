import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Facebook, Mail, MapPin, Phone } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

export const Footer = () => {
  return (
    <footer className="bg-[#F8F5F1] border-t border-border" data-testid="footer">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-12 py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          {/* Brand */}
          <div className="lg:col-span-1">
            <Link to="/" className="font-heading text-3xl text-foreground">
              Mariso
            </Link>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Handcrafted homewares & hand-poured candles designed to elevate everyday living.
            </p>
            <div className="flex gap-4 mt-6">
              <a 
                href="https://instagram.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-clay/30 transition-colors"
                data-testid="footer-instagram"
              >
                <Instagram className="h-4 w-4" strokeWidth={1.5} />
              </a>
              <a 
                href="https://facebook.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-clay/30 transition-colors"
                data-testid="footer-facebook"
              >
                <Facebook className="h-4 w-4" strokeWidth={1.5} />
              </a>
              <a 
                href="mailto:hello@mariso.com"
                className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-clay/30 transition-colors"
                data-testid="footer-email"
              >
                <Mail className="h-4 w-4" strokeWidth={1.5} />
              </a>
            </div>
          </div>

          {/* Shop */}
          <div>
            <h4 className="font-heading text-lg mb-6">Shop</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/shop" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-all-products">
                  All Products
                </Link>
              </li>
              <li>
                <Link to="/shop?category=container-candles" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-candles">
                  Container Candles
                </Link>
              </li>
              <li>
                <Link to="/shop?category=coasters" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-coasters">
                  Coasters
                </Link>
              </li>
              <li>
                <Link to="/shop?category=bouquets" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-bouquets">
                  Candle Bouquets
                </Link>
              </li>
              <li>
                <Link to="/shop?sale=true" className="text-terracotta hover:text-terracotta/80 transition-colors" data-testid="footer-sale">
                  Sale
                </Link>
              </li>
            </ul>
          </div>

          {/* Help */}
          <div>
            <h4 className="font-heading text-lg mb-6">Help</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/contact" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-contact">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link to="/shipping" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-shipping">
                  Shipping Info
                </Link>
              </li>
              <li>
                <Link to="/returns" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-returns">
                  Returns & Exchanges
                </Link>
              </li>
              <li>
                <Link to="/faq" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-faq">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h4 className="font-heading text-lg mb-6">Stay Connected</h4>
            <p className="text-muted-foreground mb-4">
              Subscribe for exclusive offers and updates.
            </p>
            <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
              <Input
                type="email"
                placeholder="Your email"
                className="flex-1 bg-white/50 border-border"
                data-testid="newsletter-email"
              />
              <Button type="submit" className="btn-primary px-6" data-testid="newsletter-submit">
                Join
              </Button>
            </form>
            <div className="mt-6 space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4" strokeWidth={1.5} />
                Mumbai, India
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4" strokeWidth={1.5} />
                +91 98765 43210
              </p>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-16 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © 2024 Mariso Candles. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground transition-colors" data-testid="footer-privacy">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-foreground transition-colors" data-testid="footer-terms">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
