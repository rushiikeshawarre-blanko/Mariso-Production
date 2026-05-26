import React, { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { setAccessTokenGetter } from './lib/api';
import { CartProvider } from "./context/CartContext";
import Layout from "./components/layout/Layout";
import MarisoLoader from "./components/ui/MarisoLoader";

// Pages
const HomePage = lazy(() => import("./pages/HomePage"));
const ShopPage = lazy(() => import("./pages/ShopPage"));
const ProductPage = lazy(() => import("./pages/ProductPage"));
const CartPage = lazy(() => import("./pages/CartPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const OrderSuccessPage = lazy(() => import("./pages/OrderSuccessPage"));
const PaymentReturnPage = lazy(() => import("./pages/PaymentReturnPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const OrderDetailsPage = lazy(() => import("./pages/account/OrderDetailsPage"));
const OrdersPage = lazy(() => import("./pages/account/OrdersPage"));
const WishlistPage = lazy(() => import("./pages/account/WishlistPage"));
const AddressesPage = lazy(() => import("./pages/account/AddressesPage"));
const FaqPage = lazy(() => import("./pages/FaqPage"));
const ContentPage = lazy(() => import("./pages/ContentPage"));
const TrackOrderPage = lazy(() => import("./pages/TrackOrderPage"));
const FeedbackPage = lazy(() => import("./pages/FeedbackPage"));

// Admin Pages
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminCustomers = lazy(() => import("./pages/admin/AdminCustomers"));
const AdminContentPages = lazy(() => import("./pages/admin/AdminContentPages"));
const AdminFaqs = lazy(() => import("./pages/admin/AdminFaqs"));
const AdminCoupons = lazy(() => import("./pages/admin/AdminCoupons"));
const AdminFeedback = lazy(() => import("./pages/admin/AdminFeedback"));
const AdminHomePage = lazy(() => import("./pages/admin/AdminHomePage"));
const AdminHomePagePreview = lazy(() => import("./pages/admin/AdminHomePagePreview"));

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

const RouteLoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#F8F5F1]">
    <MarisoLoader label="Loading page..." className="py-0" />
  </div>
);

function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
      {/* Public Routes */}
      <Route path="/" element={<HomePage />} />
      <Route path="/shop" element={<ShopPage />} />
      <Route path="/product/:id" element={<ProductPage />} />
      <Route path="/products/:slug" element={<ProductPage />} />
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
        path="/admin/homepage/preview"
        element={
          <ProtectedRoute requireAdmin>
            <AdminHomePagePreview />
          </ProtectedRoute>
        }
      />
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
        <Route path="homepage" element={<AdminHomePage />} />
        <Route path="content-pages" element={<AdminContentPages />} />
        <Route path="faqs" element={<AdminFaqs />} />
      </Route>

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
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
