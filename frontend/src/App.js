import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { setAccessTokenGetter } from './lib/api';
import { CartProvider } from "./context/CartContext";

// Pages
import HomePage from "./pages/HomePage";
import ShopPage from "./pages/ShopPage";
import ProductPage from "./pages/ProductPage";
import CartPage from "./pages/CartPage";
import CheckoutPage from "./pages/CheckoutPage";
import OrderSuccessPage from "./pages/OrderSuccessPage";
import PaymentReturnPage from "./pages/PaymentReturnPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import AccountPage from "./pages/AccountPage";
import OrderDetailsPage from "./pages/account/OrderDetailsPage";
import OrdersPage from "./pages/account/OrdersPage";
import WishlistPage from "./pages/account/WishlistPage";
import AddressesPage from "./pages/account/AddressesPage";
import FaqPage from "./pages/FaqPage";
import ContentPage from "./pages/ContentPage";
import TrackOrderPage from "./pages/TrackOrderPage";
import FeedbackPage from "./pages/FeedbackPage";
import Layout from "./components/layout/Layout";

// Admin Pages
import AdminLayout from "./pages/admin/AdminLayout";
import AdminProducts from "./pages/admin/AdminProducts";
import AdminCategories from "./pages/admin/AdminCategories";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminCustomers from "./pages/admin/AdminCustomers";
import AdminContentPages from "./pages/admin/AdminContentPages";
import AdminFaqs from "./pages/admin/AdminFaqs";
import AdminCoupons from "./pages/admin/AdminCoupons";
import AdminFeedback from "./pages/admin/AdminFeedback";

// Protected Route Component
const ProtectedRoute = ({ children, requireAdmin = false }) => {
  const { isAuthenticated, isLoading, loginWithRedirect, user } = useAuth0();

  const adminEmails = ["mariso.store@gmail.com"];
  const isAdmin = () => adminEmails.includes((user?.email || "").toLowerCase());

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      loginWithRedirect({
        appState: {
          returnTo: `${window.location.pathname}${window.location.search}`,
        },
      });
    }
  }, [isLoading, isAuthenticated, loginWithRedirect]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F5F1]">
        <div className="animate-pulse text-center">
          <div className="font-heading text-3xl text-foreground mb-2">Mariso</div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (requireAdmin && !isAdmin()) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function ScrollToTop() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, search, hash]);

  return null;
}

const Auth0TokenBridge = () => {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();

  useEffect(() => {
    if (!isAuthenticated) {
      setAccessTokenGetter(null);
      return;
    }

    setAccessTokenGetter(async () => {
      try {
        const token = await getAccessTokenSilently({
          audience: "https://mariso-api"
        });
        return token;
      } catch (error) {
        console.error('Error fetching token:', error);
        return null;
      }
    });
  }, [getAccessTokenSilently, isAuthenticated]);

  return null;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<HomePage />} />
      <Route path="/shop" element={<ShopPage />} />
      <Route path="/product/:id" element={<ProductPage />} />
      <Route path="/faq" element={<Layout><FaqPage /></Layout>} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/pages/:slug" element={<Layout><ContentPage /></Layout>} />
      <Route path="/track-order/:token" element={<TrackOrderPage />} />
      <Route path="/feedback/:feedbackToken" element={<FeedbackPage />} />
      {/* Protected Routes */}
      <Route
        path="/checkout"
        element={
          <ProtectedRoute>
            <CheckoutPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/order-success/:orderId"
        element={
          <ProtectedRoute>
            <OrderSuccessPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payment/cashfree/return"
        element={
          <ProtectedRoute>
            <PaymentReturnPage />
          </ProtectedRoute>
        }
      />

      {/* Account Routes */}
      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <AccountPage />
          </ProtectedRoute>
        }
      >
        <Route path="orders" element={<OrdersPage />} />
        <Route path="wishlist" element={<WishlistPage />} />
        <Route path="addresses" element={<AddressesPage />} />
        <Route path="orders/:id" element={<OrderDetailsPage />} />
      </Route>

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute requireAdmin>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="products" element={<AdminProducts />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="coupons" element={<AdminCoupons />} />
        <Route path="feedback" element={<AdminFeedback />} />
        <Route path="content-pages" element={<AdminContentPages />} />
        <Route path="faqs" element={<AdminFaqs />} />
      </Route>

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <CartProvider>
          <ScrollToTop />
          <Auth0TokenBridge />
          <AppRoutes />
        </CartProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
