import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { User, Package, Heart, MapPin, LogOut } from 'lucide-react';
import { useAuth0 } from '@auth0/auth0-react';
import { getUserOrders, getWishlist } from '../lib/api';

const AccountPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, loginWithRedirect, logout: auth0Logout, isLoading } = useAuth0();
  const [orders, setOrders] = useState([]);
  const [wishlist, setWishlist] = useState([]);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      loginWithRedirect({
        appState: {
          returnTo: '/account',
        },
      });
      return;
    }

    const fetchData = async () => {
      try {
        const [ordersData, wishlistData] = await Promise.all([
          getUserOrders(),
          getWishlist()
        ]);
        setOrders(ordersData);
        setWishlist(wishlistData);
      } catch (error) {
        console.error('Error fetching account data:', error);
      }
    };

    fetchData();
  }, [isAuthenticated, isLoading, loginWithRedirect]);

  const handleLogout = () => {
    auth0Logout({
      logoutParams: {
        returnTo: window.location.origin,
      },
    });
  };

  const navItems = [
    { name: 'Profile', href: '/account', icon: User },
    { name: 'Orders', href: '/account/orders', icon: Package },
    { name: 'Wishlist', href: '/account/wishlist', icon: Heart },
    { name: 'Addresses', href: '/account/addresses', icon: MapPin },
  ];

  const isActive = (href) => {
    if (href === '/account') {
      return location.pathname === '/account';
    }
    return location.pathname.startsWith(href);
  };

  // Default account view
  const AccountOverview = () => (
    <div className="space-y-8">
      <div>
        <h2 className="font-heading text-2xl mb-6">Welcome, {user?.name}</h2>
        <div className="bg-white rounded-xl p-6 card-shadow">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-6 bg-muted/30 rounded-lg">
              <p className="text-3xl font-heading mb-1">{orders.length}</p>
              <p className="text-sm text-muted-foreground">Total Orders</p>
            </div>
            <div className="text-center p-6 bg-muted/30 rounded-lg">
              <p className="text-3xl font-heading mb-1">{wishlist.length}</p>
              <p className="text-sm text-muted-foreground">Wishlist Items</p>
            </div>
            <div className="text-center p-6 bg-muted/30 rounded-lg">
              <p className="text-3xl font-heading mb-1">{user?.addresses?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Saved Addresses</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      {orders.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-xl">Recent Orders</h3>
            <Link to="/account/orders">
              <Button variant="ghost" size="sm">View All</Button>
            </Link>
          </div>
          <div className="bg-white rounded-xl divide-y divide-border card-shadow">
            {orders.slice(0, 3).map((order) => (
              <div key={order.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">Order #{order.id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString()} • {order.items?.length} items
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">₹{order.total_price?.toLocaleString()}</p>
                  <span className={`text-xs px-2 py-1 rounded-full status-${order.status}`}>
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Profile Info */}
      <div>
        <h3 className="font-heading text-xl mb-4">Profile Information</h3>
        <div className="bg-white rounded-xl p-6 card-shadow">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Full Name</p>
              <p className="font-medium">{user?.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{user?.email}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <Layout>
      <div className="pt-32 pb-24 min-h-screen" data-testid="account-page">
        <div className="max-w-[1440px] mx-auto container-padding">
          <h1 className="font-heading text-4xl md:text-5xl tracking-tight mb-12">My Account</h1>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar */}
            <aside className="lg:col-span-1">
              <nav className="bg-white rounded-xl p-4 card-shadow space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        isActive(item.href)
                          ? 'bg-clay/30 text-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                      data-testid={`account-nav-${item.name.toLowerCase()}`}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.5} />
                      {item.name}
                    </Link>
                  );
                })}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors w-full"
                  data-testid="account-logout"
                >
                  <LogOut className="h-5 w-5" strokeWidth={1.5} />
                  Logout
                </button>
              </nav>
            </aside>

            {/* Main Content */}
            <main className="lg:col-span-3">
              {location.pathname === '/account' ? <AccountOverview /> : <Outlet />}
            </main>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AccountPage;
