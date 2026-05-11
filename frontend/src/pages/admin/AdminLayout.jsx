import React, { useState, useEffect, useCallback } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { getDashboardStats, exportOrdersExcel } from '../../lib/api';
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
  UserCheck,
  FileText,
  HelpCircle,
  Menu,
  X
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
  const [exportLoading, setExportLoading] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { user, isAuthenticated, loginWithRedirect, logout: auth0Logout } = useAuth0();
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [period, setPeriod] = useState('weekly');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM format for month picker
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [appliedCustomRange, setAppliedCustomRange] = useState({ start: '', end: '' });
  const adminEmails = ['mariso.store@gmail.com'];
  const isAdmin = adminEmails.includes((user?.email || '').toLowerCase());

  useEffect(() => {
    if (!isAuthenticated) {
      loginWithRedirect({
        appState: {
          returnTo: '/admin',
        },
      });
      return;
    }

    if (!isAdmin) {
      navigate('/');
    }
  }, [isAuthenticated, loginWithRedirect, navigate, isAdmin]);

  useEffect(() => {
    if (!stats?.period_stats?.length) return;

    const latest = stats.period_stats[stats.period_stats.length - 1]?._id;
    if (!latest) return;

    const date = new Date(latest);
    const latestMonth = date.toISOString().slice(0, 7);

    if (period === 'monthly' && latestMonth !== selectedMonth) {
      setSelectedMonth(latestMonth);
    }
  }, [stats, period, selectedMonth]);

  useEffect(() => {
    if (period !== 'custom') return;
    setAppliedCustomRange({ start: '', end: '' });
  }, [period]);

  const fetchStats = useCallback(async () => {
    if (location.pathname !== '/admin') return;

    if (period === 'custom' && (!appliedCustomRange.start || !appliedCustomRange.end)) {
      return;
    }

    if (period === 'monthly' && !selectedMonth) {
      return;
    }

    setStatsLoading(true);
    try {
      const params = {
        period,
        ...(period === 'monthly' && selectedMonth
          ? { month: selectedMonth }
          : {}),
        ...(period === 'custom'
          ? {
              start_date: appliedCustomRange.start,
              end_date: appliedCustomRange.end,
            }
          : {}),
      };

      const data = await getDashboardStats(params);
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setStatsLoading(false);
    }
  }, [location.pathname, period, selectedMonth, appliedCustomRange.start, appliedCustomRange.end]);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return;
    fetchStats();
  }, [isAuthenticated, isAdmin, fetchStats]);

  const handleLogout = () => {
    auth0Logout({
      logoutParams: {
        returnTo: window.location.origin,
      },
    });
  };

  const handleExport = async () => {
    if (exportLoading) return;

    try {
      setExportLoading(true);

      const params = {
        period: period === 'custom' ? 'custom' : period,
        ...(period === 'monthly' && selectedMonth
          ? { month: selectedMonth }
          : {}),
        ...(period === 'custom' && appliedCustomRange.start && appliedCustomRange.end
          ? {
              start_date: appliedCustomRange.start,
              end_date: appliedCustomRange.end,
            }
          : {}),
      };
      
      const response = await exportOrdersExcel(params);

      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       });

       const contentDisposition = response.headers['content-disposition'] || '';
       const fileNameMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
       const fileName = fileNameMatch?.[1] || `mariso_orders_${period}.xlsx`;

       const url = window.URL.createObjectURL(blob);
       const link = document.createElement('a');
       link.href = url;
       link.setAttribute('download', fileName);
       document.body.appendChild(link);
       link.click();
       link.remove();
       window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting orders:', error);
    } finally {
      setExportLoading(false);
    }
  };

  const navItems = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Products', href: '/admin/products', icon: Package },
    { name: 'Categories', href: '/admin/categories', icon: FolderTree },
    { name: 'Orders', href: '/admin/orders', icon: ShoppingCart },
    { name: 'Customers', href: '/admin/customers', icon: Users },
    { name: 'Content Pages', href: '/admin/content-pages', icon: FileText },
    { name: 'FAQs', href: '/admin/faqs', icon: HelpCircle },
  ];

  const isActive = (href) => {
    if (href === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(href);
  };

  const getPageTitle = () => {
    if (location.pathname === '/admin') return 'Dashboard';
    if (location.pathname.startsWith('/admin/products')) return 'Products';
    if (location.pathname.startsWith('/admin/categories')) return 'Categories';
    if (location.pathname.startsWith('/admin/orders')) return 'Orders';
    if (location.pathname.startsWith('/admin/customers')) return 'Customers';
    if (location.pathname.startsWith('/admin/content-pages')) return 'Content Pages';
    if (location.pathname.startsWith('/admin/faqs')) return 'FAQs';
    return 'Admin';
  };

  const closeMobileSidebar = () => setMobileSidebarOpen(false);

  const getRevenueTitle = () => {
    if (period === 'monthly') return 'Monthly Revenue';
    if (period === 'quarterly') return 'Quarterly Revenue';
    if (period === 'yearly') return 'Yearly Revenue';
    if (period === 'custom') return 'Custom Range Revenue';
    return 'Weekly Revenue';
  };

  const formatChartLabel = (value) => {
    if (!value) return '';

    if (period === 'weekly') {
      return new Date(value).toLocaleDateString('en-US', { weekday: 'short' });
    }

    if (period === 'monthly') {
      return new Date(value).toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
    }

    if (period === 'quarterly') {
      return new Date(value).toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
    }

    if (period === 'yearly') {
      return new Date(value).toLocaleDateString('en-US', { month: 'short' });
    }

    return new Date(value).toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
  };

  const formatMonthLabel = (monthStr) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const date = new Date(Number(year), Number(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const isGenericCustomerName = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return !normalized || normalized === 'user';
  };

  const getOrderCustomerDisplayName = (order) => {
    const userName = isGenericCustomerName(order.user_name) ? '' : order.user_name;

    return (
      order.billing_name ||
      order.shipping_name ||
      userName ||
      order.customer_name ||
      order.billing_email ||
      order.user_email ||
      order.billing_phone ||
      order.shipping_phone ||
      order.phone ||
      'Guest Customer'
    );
  };

  // Dashboard Overview Component
  const DashboardOverview = () => {
    if (statsLoading || !stats) {
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

    const sourceSeries =
      stats.period_stats ||
      stats.revenue_stats ||
      stats.weekly_stats ||
      [];

    const chartData = sourceSeries.map((point) => ({
      date: formatChartLabel(point._id || point.date),
      orders: point.orders || 0,
      revenue: point.revenue || 0,
    }));
    const hasPeriodData = chartData.length > 0;
    const isZeroPeriod = (stats.period_orders ?? 0) === 0;

    return (
      <div className="space-y-6" data-testid="admin-dashboard">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl p-6 card-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-3xl font-heading mt-1" data-testid="total-revenue">
                  ₹{stats.total_revenue?.toLocaleString()}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.14em] text-foreground/45">
                  {period === 'monthly'
                    ? `${formatMonthLabel(selectedMonth)}: ₹${(stats.period_revenue ?? 0).toLocaleString()}`
                    : `${getRevenueTitle()}: ₹${(stats.period_revenue ?? 0).toLocaleString()}`
                  }
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
                <p className="mt-2 text-xs uppercase tracking-[0.14em] text-foreground/45">
                  {period === 'custom' ? 'Custom Range' : period}: {stats.period_orders ?? 0}
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
          <div className="bg-white rounded-xl p-6 card-shadow min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading text-lg">{getRevenueTitle()}</h3>
              <span className="text-xs uppercase tracking-[0.16em] text-foreground/45">
                {period === 'custom' && appliedCustomRange.start && appliedCustomRange.end
                  ? `${appliedCustomRange.start} → ${appliedCustomRange.end}`
                  : period === 'monthly' && selectedMonth
                    ? formatMonthLabel(selectedMonth)
                    : period}
              </span>
            </div>

            <div className="h-64 min-w-0">
              {!hasPeriodData || isZeroPeriod ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border/70 bg-[#FAF7F3] px-6 text-center">
                  <div className="max-w-md">
                    <p className="font-heading text-xl text-foreground">No orders in this period</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      There are no completed order records for the selected range yet. Try switching to Monthly or Yearly view, or choose a broader custom date range.
                    </p>
                    <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-border/60 bg-white px-4 py-2 text-xs uppercase tracking-[0.14em] text-foreground/55">
                      {period === 'custom' ? 'Custom range selected' : `${period} view selected`}
                    </div>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={280}>
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
              )}
            </div>
          </div>

          {/* Order Status */}
          <div className="bg-white rounded-xl p-6 card-shadow">
            <h3 className="font-heading text-lg mb-4">Orders by Status</h3>
            <div className="space-y-4">
              {Object.keys(stats.orders_by_status || {}).length === 0 ? (
                <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border/70 bg-[#FAF7F3] px-6 text-center">
                  <div>
                    <p className="font-medium text-foreground/75">No status data available</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Once orders are placed in the selected period, their statuses will appear here.
                    </p>
                  </div>
                </div>
              ) : (
                Object.entries(stats.orders_by_status || {}).map(([status, count]) => (
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
                ))
              )}
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
            {!stats.recent_orders?.length ? (
              <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border/70 bg-[#FAF7F3] px-6 text-center">
                <div>
                  <p className="font-medium text-foreground/75">No recent orders found</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Orders from the selected period will appear here once customers start placing them.
                  </p>
                </div>
              </div>
            ) : (
              <table className="min-w-[760px] w-full">
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
                      <td className="py-3 px-4">{getOrderCustomerDisplayName(order)}</td>
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
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8F5F1] text-foreground" data-testid="admin-layout">
      {mobileSidebarOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={closeMobileSidebar}
          aria-hidden="true"
        />
      ) : null}

      <aside className="hidden min-h-screen w-64 border-r border-border/60 bg-[#F2ECE5] lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:flex-col">
        <div className="px-6 pt-7 pb-5 border-b border-border/40">
          <Link to="/" className="font-heading text-[2rem] tracking-[-0.02em] text-foreground block">
            Mariso
          </Link>
          <p className="text-xs uppercase tracking-[0.18em] text-foreground/45 mt-1.5">Admin Dashboard</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`group flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-medium transition-all duration-200 ${
                  isActive(item.href)
                    ? 'bg-white text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.06)] border border-border/60'
                    : 'text-foreground/70 border border-transparent hover:bg-white/70 hover:text-foreground hover:border-border/50'
                }`}
                data-testid={`admin-nav-${item.name.toLowerCase()}`}
              >
                <Icon className={`h-[18px] w-[18px] transition-colors duration-200 ${isActive(item.href) ? 'text-foreground' : 'text-foreground/55 group-hover:text-foreground/80'}`} strokeWidth={1.7} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/50 bg-[#F2ECE5]">
          <div className="px-4 py-3 mb-2 rounded-xl bg-white/70 border border-border/50">
            <p className="font-medium text-sm text-foreground">{user?.name}</p>
            <p className="text-xs text-muted-foreground mt-1 break-all">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-medium text-foreground/70 transition-all duration-200 hover:bg-white/70 hover:text-destructive border border-transparent hover:border-border/50"
            data-testid="admin-logout"
          >
            <LogOut className="h-[18px] w-[18px] text-foreground/55 transition-colors duration-200 group-hover:text-destructive" strokeWidth={1.7} />
            Logout
          </button>
        </div>
      </aside>

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[86vw] flex-col border-r border-border/60 bg-[#F2ECE5] transition-transform duration-300 lg:hidden ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/40">
          <div>
            <Link to="/" className="font-heading text-[1.75rem] tracking-[-0.02em] text-foreground block" onClick={closeMobileSidebar}>
              Mariso
            </Link>
            <p className="text-[11px] uppercase tracking-[0.18em] text-foreground/45 mt-1">Admin Dashboard</p>
          </div>
          <button
            type="button"
            onClick={closeMobileSidebar}
            className="rounded-full border border-border/60 bg-white p-2 text-foreground/70"
            aria-label="Close admin menu"
          >
            <X className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={closeMobileSidebar}
                className={`group flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-medium transition-all duration-200 ${
                  isActive(item.href)
                    ? 'bg-white text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.06)] border border-border/60'
                    : 'text-foreground/70 border border-transparent hover:bg-white/70 hover:text-foreground hover:border-border/50'
                }`}
                data-testid={`admin-mobile-nav-${item.name.toLowerCase()}`}
              >
                <Icon className={`h-[18px] w-[18px] transition-colors duration-200 ${isActive(item.href) ? 'text-foreground' : 'text-foreground/55 group-hover:text-foreground/80'}`} strokeWidth={1.7} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/50 bg-[#F2ECE5]">
          <div className="px-4 py-3 mb-2 rounded-xl bg-white/70 border border-border/50">
            <p className="font-medium text-sm text-foreground">{user?.name}</p>
            <p className="text-xs text-muted-foreground mt-1 break-all">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-medium text-foreground/70 transition-all duration-200 hover:bg-white/70 hover:text-destructive border border-transparent hover:border-border/50"
            data-testid="admin-mobile-logout"
          >
            <LogOut className="h-[18px] w-[18px] text-foreground/55 transition-colors duration-200 group-hover:text-destructive" strokeWidth={1.7} />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:ml-64 lg:px-10 lg:py-9">
        <div className="max-w-[1240px] mx-auto">
          <div className="mb-6 flex items-center justify-between gap-3 lg:hidden">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/45 mb-1">Mariso Admin</p>
              <h1 className="font-heading text-[1.8rem] leading-none tracking-[-0.03em] text-foreground">
                {getPageTitle()}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="inline-flex items-center justify-center rounded-full border border-border/60 bg-white p-3 text-foreground shadow-[0_6px_20px_rgba(0,0,0,0.04)]"
              aria-label="Open admin menu"
            >
              <Menu className="h-5 w-5" strokeWidth={1.8} />
            </button>
          </div>

          <div className="mb-8 hidden flex-col gap-6 lg:flex lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-foreground/45 mb-2">Mariso Admin</p>
              <h1 className="font-heading text-[2.6rem] leading-none tracking-[-0.03em] text-foreground">
                {getPageTitle()}
              </h1>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="flex items-center gap-2 rounded-full border border-border/60 bg-white px-4 py-2 text-sm shadow-[0_6px_20px_rgba(0,0,0,0.04)]">
                <span className="text-xs uppercase tracking-[0.16em] text-foreground/45">View</span>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="bg-transparent outline-none text-foreground font-medium cursor-pointer"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {period === 'custom' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="date"
                    value={customRange.start}
                    onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })}
                    className="border border-border/60 rounded-lg px-2 py-1 text-sm bg-white"
                  />
                  <span className="text-muted-foreground text-xs">to</span>
                  <input
                    type="date"
                    value={customRange.end}
                    onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })}
                    className="border border-border/60 rounded-lg px-2 py-1 text-sm bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedCustomRange({
                        start: customRange.start,
                        end: customRange.end,
                      });
                    }}
                    disabled={
                      !customRange.start ||
                      !customRange.end ||
                      statsLoading ||
                      (appliedCustomRange.start === customRange.start &&
                        appliedCustomRange.end === customRange.end)
                    }
                    className="rounded-full border border-border/60 bg-white px-4 py-2 text-sm font-medium text-foreground transition hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Apply Range
                  </button>
                </div>
              )}

              {period === 'monthly' && (
                <div className="flex items-center gap-2 rounded-full border border-border/60 bg-white px-4 py-2 text-sm shadow-[0_6px_20px_rgba(0,0,0,0.04)]">
                  <span className="text-xs uppercase tracking-[0.16em] text-foreground/45">Month</span>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    max={currentMonth}
                    title="Future months are not available yet"
                    className="bg-transparent outline-none text-foreground font-medium cursor-pointer"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={handleExport}
                disabled={
                  exportLoading ||
                  (period === 'monthly' && !selectedMonth) ||
                  (period === 'custom' &&
                    (!appliedCustomRange.start || !appliedCustomRange.end))
                }
                className="flex items-center gap-2 rounded-full bg-foreground text-primary-foreground px-5 py-2 text-sm font-medium shadow hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportLoading ? 'Exporting...' : 'Export Data'}
              </button>

              <div className="hidden md:flex items-center gap-2 rounded-full border border-border/60 bg-white/80 px-4 py-2 text-sm text-foreground/70 shadow-[0_6px_20px_rgba(0,0,0,0.04)]">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
                Admin Active
              </div>
            </div>
          </div>

          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-border/60 bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)] lg:hidden">
            <div className="flex items-center gap-2 rounded-full border border-border/60 bg-[#F8F5F1] px-4 py-2 text-sm">
              <span className="text-xs uppercase tracking-[0.16em] text-foreground/45">View</span>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none text-foreground font-medium cursor-pointer"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            {period === 'custom' && (
              <div className="flex flex-col gap-2">
                <input
                  type="date"
                  value={customRange.start}
                  onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })}
                  className="border border-border/60 rounded-lg px-3 py-2 text-sm bg-[#F8F5F1]"
                />
                <input
                  type="date"
                  value={customRange.end}
                  onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })}
                  className="border border-border/60 rounded-lg px-3 py-2 text-sm bg-[#F8F5F1]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setAppliedCustomRange({
                      start: customRange.start,
                      end: customRange.end,
                    });
                  }}
                  disabled={
                    !customRange.start ||
                    !customRange.end ||
                    statsLoading ||
                    (appliedCustomRange.start === customRange.start &&
                      appliedCustomRange.end === customRange.end)
                  }
                  className="rounded-full border border-border/60 bg-white px-4 py-2 text-sm font-medium text-foreground transition hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply Range
                </button>
              </div>
            )}

            {period === 'monthly' && (
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                max={currentMonth}
                title="Future months are not available yet"
                className="border border-border/60 rounded-lg px-3 py-2 text-sm bg-[#F8F5F1] text-foreground font-medium"
              />
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleExport}
                disabled={
                  exportLoading ||
                  (period === 'monthly' && !selectedMonth) ||
                  (period === 'custom' &&
                    (!appliedCustomRange.start || !appliedCustomRange.end))
                }
                className="flex items-center justify-center gap-2 rounded-full bg-foreground text-primary-foreground px-5 py-2 text-sm font-medium shadow hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportLoading ? 'Exporting...' : 'Export Data'}
              </button>
              <div className="inline-flex items-center justify-center gap-2 rounded-full border border-border/60 bg-[#F8F5F1] px-4 py-2 text-sm text-foreground/70">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
                Admin Active
              </div>
            </div>
          </div>

          {location.pathname === '/admin' ? <DashboardOverview /> : <Outlet />}
        </div>
      </main>

      <Toaster position="bottom-right" />
    </div>
  );
};

export default AdminLayout;
