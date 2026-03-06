import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getDashboardStats } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { 
  LayoutDashboard, 
  Package, 
  FolderTree, 
  ShoppingCart, 
  Users, 
  LogOut,
  TrendingUp,
  DollarSign,
  Box,
  UserCheck
} from 'lucide-react';
import { Toaster } from '../../components/ui/sonner';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!isAdmin()) {
      navigate('/login');
      return;
    }

    if (location.pathname === '/admin') {
      fetchStats();
    }
  }, [isAdmin, navigate, location.pathname]);

  const fetchStats = async () => {
    try {
      const data = await getDashboardStats();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navItems = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Products', href: '/admin/products', icon: Package },
    { name: 'Categories', href: '/admin/categories', icon: FolderTree },
    { name: 'Orders', href: '/admin/orders', icon: ShoppingCart },
    { name: 'Customers', href: '/admin/customers', icon: Users },
  ];

  const isActive = (href) => {
    if (href === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(href);
  };

  // Dashboard Overview Component
  const DashboardOverview = () => {
    if (!stats) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl p-6 card-shadow animate-pulse">
              <div className="h-4 bg-muted rounded w-1/2 mb-2" />
              <div className="h-8 bg-muted rounded w-3/4" />
            </div>
          ))}
        </div>
      );
    }

    const chartData = stats.weekly_stats?.map((day) => ({
      date: new Date(day._id).toLocaleDateString('en-US', { weekday: 'short' }),
      orders: day.orders,
      revenue: day.revenue
    })) || [];

    return (
      <div className="space-y-8" data-testid="admin-dashboard">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl p-6 card-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-3xl font-heading mt-1" data-testid="total-revenue">
                  ₹{stats.total_revenue?.toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 bg-terracotta/10 rounded-full flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-terracotta" strokeWidth={1.5} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 card-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-3xl font-heading mt-1" data-testid="total-orders">
                  {stats.total_orders}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <ShoppingCart className="h-6 w-6 text-blue-600" strokeWidth={1.5} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 card-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Products</p>
                <p className="text-3xl font-heading mt-1" data-testid="total-products">
                  {stats.total_products}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <Box className="h-6 w-6 text-purple-600" strokeWidth={1.5} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 card-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Customers</p>
                <p className="text-3xl font-heading mt-1" data-testid="total-customers">
                  {stats.total_customers}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <UserCheck className="h-6 w-6 text-green-600" strokeWidth={1.5} />
              </div>
            </div>
          </div>
        </div>

        {/* Charts & Recent Orders */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Weekly Chart */}
          <div className="bg-white rounded-xl p-6 card-shadow">
            <h3 className="font-heading text-lg mb-4">Weekly Revenue</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E6E1DC" />
                  <XAxis dataKey="date" stroke="#57534E" fontSize={12} />
                  <YAxis stroke="#57534E" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#F8F5F1', 
                      border: '1px solid #E6E1DC',
                      borderRadius: '8px'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#C98E74" 
                    fill="#C98E74" 
                    fillOpacity={0.2} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Order Status */}
          <div className="bg-white rounded-xl p-6 card-shadow">
            <h3 className="font-heading text-lg mb-4">Orders by Status</h3>
            <div className="space-y-4">
              {Object.entries(stats.orders_by_status || {}).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full ${
                      status === 'delivered' ? 'bg-green-500' :
                      status === 'shipped' ? 'bg-indigo-500' :
                      status === 'packed' ? 'bg-purple-500' :
                      status === 'confirmed' ? 'bg-blue-500' :
                      'bg-yellow-500'
                    }`} />
                    <span className="capitalize">{status}</span>
                  </div>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-xl p-6 card-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-lg">Recent Orders</h3>
            <Link to="/admin/orders">
              <Button variant="ghost" size="sm">View All</Button>
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Order ID</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Customer</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Items</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Total</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_orders?.map((order) => (
                  <tr key={order.id} className="border-b border-border last:border-0">
                    <td className="py-3 px-4 font-medium">#{order.id.slice(0, 8).toUpperCase()}</td>
                    <td className="py-3 px-4">{order.user_name || order.billing_name}</td>
                    <td className="py-3 px-4">{order.items?.length} items</td>
                    <td className="py-3 px-4">₹{order.total_price?.toLocaleString()}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-1 rounded-full status-${order.status}`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8F5F1] flex" data-testid="admin-layout">
      {/* Sidebar */}
      <aside className="w-64 bg-clay/30 min-h-screen flex-shrink-0 fixed left-0 top-0 bottom-0">
        <div className="p-6">
          <Link to="/" className="font-heading text-2xl text-foreground">
            Mariso
          </Link>
          <p className="text-xs text-muted-foreground mt-1">Admin Dashboard</p>
        </div>

        <nav className="px-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`admin-nav-item ${isActive(item.href) ? 'active' : ''}`}
                data-testid={`admin-nav-${item.name.toLowerCase()}`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.5} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border/50">
          <div className="px-4 py-2 mb-2">
            <p className="font-medium text-sm">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="admin-nav-item w-full text-muted-foreground hover:text-destructive"
            data-testid="admin-logout"
          >
            <LogOut className="h-5 w-5" strokeWidth={1.5} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-[1200px] mx-auto">
          {location.pathname === '/admin' ? <DashboardOverview /> : <Outlet />}
        </div>
      </main>

      <Toaster position="bottom-right" />
    </div>
  );
};

export default AdminLayout;
