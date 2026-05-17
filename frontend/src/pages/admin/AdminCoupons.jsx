import React, { useEffect, useMemo, useState } from 'react';
import {
  createAdminCoupon,
  deleteAdminCoupon,
  getAdminCoupons,
  getAdminProducts,
  getCategories,
  toggleAdminCoupon,
  updateAdminCoupon,
} from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { BadgePercent, Pencil, Plus, Power, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const initialFormState = {
  code: '',
  coupon_type: 'general',
  description: '',
  discount_type: 'percentage',
  discount_value: '',
  max_discount_amount: '',
  minimum_order_amount: '',
  start_date: '',
  end_date: '',
  usage_limit_total: '',
  usage_limit_per_customer: '',
  applies_to: 'all',
  applicable_category_ids: [],
  applicable_product_ids: [],
  influencer_name: '',
  influencer_handle: '',
  is_active: true,
};

const COUPON_TYPE_LABELS = {
  general: 'General',
  influencer: 'Influencer',
  personal: 'Personal',
  recovery: 'Recovery',
};

const APPLIES_TO_LABELS = {
  all: 'All Products',
  categories: 'Selected Categories',
  products: 'Selected Products',
};

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const toDatetimeLocalValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const toNullableNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  return Number(value);
};

const getStatus = (coupon) => {
  const now = new Date();
  const startDate = coupon.start_date ? new Date(coupon.start_date) : null;
  const endDate = coupon.end_date ? new Date(coupon.end_date) : null;

  if (endDate && !Number.isNaN(endDate.getTime()) && endDate < now) {
    return { label: 'Expired', className: 'bg-orange-100 text-orange-900' };
  }

  if (!coupon.is_active) {
    return { label: 'Inactive', className: 'bg-gray-100 text-gray-700' };
  }

  if (startDate && !Number.isNaN(startDate.getTime()) && startDate > now) {
    return { label: 'Scheduled', className: 'bg-blue-100 text-blue-800' };
  }

  return { label: 'Active', className: 'bg-green-100 text-green-800' };
};

const getDiscountLabel = (coupon) => {
  if (coupon.discount_type === 'percentage') {
    const cap = coupon.max_discount_amount
      ? ` up to ${formatCurrency(coupon.max_discount_amount)}`
      : '';
    return `${coupon.discount_value}%${cap}`;
  }

  return `${formatCurrency(coupon.discount_value)} off`;
};

const getCreatedFor = (coupon) => {
  if (coupon.coupon_type === 'influencer') {
    const handle = coupon.influencer_handle ? ` / ${coupon.influencer_handle}` : '';
    return coupon.influencer_name ? `${coupon.influencer_name}${handle}` : coupon.influencer_handle || '-';
  }

  if (coupon.coupon_type === 'personal') return 'Personal';

  return '-';
};

const AdminCoupons = () => {
  const [coupons, setCoupons] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [formData, setFormData] = useState(initialFormState);
  const [searchQuery, setSearchQuery] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');

    try {
      const [couponData, categoryData, productData] = await Promise.all([
        getAdminCoupons(),
        getCategories(),
        getAdminProducts(),
      ]);

      setCoupons(couponData || []);
      setCategories(categoryData || []);
      setProducts(productData || []);
    } catch (err) {
      console.error('Error fetching coupons:', err);
      setError('Failed to load coupon data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setEditingCoupon(null);
    setFormData(initialFormState);
    setProductQuery('');
    setError('');
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code || '',
      coupon_type: coupon.coupon_type || 'general',
      description: coupon.description || '',
      discount_type: coupon.discount_type || 'percentage',
      discount_value: coupon.discount_value ?? '',
      max_discount_amount: coupon.max_discount_amount ?? '',
      minimum_order_amount: coupon.minimum_order_amount ?? '',
      start_date: toDatetimeLocalValue(coupon.start_date),
      end_date: toDatetimeLocalValue(coupon.end_date),
      usage_limit_total: coupon.usage_limit_total ?? '',
      usage_limit_per_customer: coupon.usage_limit_per_customer ?? '',
      applies_to: coupon.applies_to || 'all',
      applicable_category_ids: coupon.applicable_category_ids || [],
      applicable_product_ids: coupon.applicable_product_ids || [],
      influencer_name: coupon.influencer_name || '',
      influencer_handle: coupon.influencer_handle || '',
      is_active: coupon.is_active !== false,
    });
    setProductQuery('');
    setError('');
    setDialogOpen(true);
  };

  const handleDialogOpenChange = (open) => {
    setDialogOpen(open);
    if (!open) {
      resetForm();
    }
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value,
      };

      if (name === 'discount_type' && value === 'fixed') {
        next.max_discount_amount = '';
      }

      if (name === 'applies_to') {
        if (value !== 'categories') next.applicable_category_ids = [];
        if (value !== 'products') next.applicable_product_ids = [];
      }

      return next;
    });
  };

  const toggleSelection = (field, id) => {
    setFormData((prev) => {
      const current = new Set(prev[field] || []);
      if (current.has(id)) {
        current.delete(id);
      } else {
        current.add(id);
      }

      return {
        ...prev,
        [field]: Array.from(current),
      };
    });
  };

  const validateForm = () => {
    const code = formData.code.trim();
    const discountValue = Number(formData.discount_value);

    if (!code) return 'Coupon code is required.';
    if (!discountValue || discountValue <= 0) return 'Discount value must be greater than 0.';
    if (formData.discount_type === 'percentage' && discountValue > 100) {
      return 'Percentage discount value must be 100 or less.';
    }
    if (formData.applies_to === 'categories' && formData.applicable_category_ids.length === 0) {
      return 'Select at least one applicable category.';
    }
    if (formData.applies_to === 'products' && formData.applicable_product_ids.length === 0) {
      return 'Select at least one applicable product.';
    }

    return '';
  };

  const buildPayload = () => ({
    code: formData.code.trim().toUpperCase(),
    coupon_type: formData.coupon_type,
    description: formData.description.trim(),
    discount_type: formData.discount_type,
    discount_value: Number(formData.discount_value),
    max_discount_amount: formData.discount_type === 'percentage'
      ? toNullableNumber(formData.max_discount_amount)
      : null,
    minimum_order_amount: Number(formData.minimum_order_amount || 0),
    start_date: formData.start_date || null,
    end_date: formData.end_date || null,
    usage_limit_total: toNullableNumber(formData.usage_limit_total),
    usage_limit_per_customer: toNullableNumber(formData.usage_limit_per_customer),
    applies_to: formData.applies_to,
    applicable_category_ids: formData.applies_to === 'categories' ? formData.applicable_category_ids : [],
    applicable_product_ids: formData.applies_to === 'products' ? formData.applicable_product_ids : [],
    influencer_name: formData.influencer_name.trim(),
    influencer_handle: formData.influencer_handle.trim(),
    is_active: formData.is_active,
    allow_stacking: false,
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = buildPayload();
      if (editingCoupon) {
        await updateAdminCoupon(editingCoupon.id, payload);
        toast.success('Coupon updated successfully');
      } else {
        await createAdminCoupon(payload);
        toast.success('Coupon created successfully');
      }

      await fetchData();
      setDialogOpen(false);
      resetForm();
    } catch (err) {
      console.error('Error saving coupon:', err);
      setError(err?.response?.data?.detail || 'Failed to save coupon.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleCoupon = async (coupon) => {
    try {
      await toggleAdminCoupon(coupon.id);
      toast.success(coupon.is_active ? 'Coupon disabled' : 'Coupon enabled');
      await fetchData();
    } catch (err) {
      console.error('Error toggling coupon:', err);
      toast.error(err?.response?.data?.detail || 'Failed to update coupon status.');
    }
  };

  const handleDeleteCoupon = async (coupon) => {
    const confirmed = window.confirm(`Delete coupon ${coupon.code}?`);
    if (!confirmed) return;

    try {
      await deleteAdminCoupon(coupon.id);
      toast.success('Coupon deleted');
      await fetchData();
    } catch (err) {
      console.error('Error deleting coupon:', err);
      toast.error(err?.response?.data?.detail || 'Failed to delete coupon.');
    }
  };

  const filteredCoupons = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return coupons;

    return coupons.filter((coupon) =>
      coupon.code?.toLowerCase().includes(query) ||
      coupon.description?.toLowerCase().includes(query) ||
      coupon.coupon_type?.toLowerCase().includes(query) ||
      coupon.influencer_name?.toLowerCase().includes(query) ||
      coupon.influencer_handle?.toLowerCase().includes(query)
    );
  }, [coupons, searchQuery]);

  const filteredProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    const sortedProducts = [...products].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (!query) return sortedProducts.slice(0, 60);

    return sortedProducts
      .filter((product) =>
        product.name?.toLowerCase().includes(query) ||
        product.sku?.toLowerCase().includes(query)
      )
      .slice(0, 60);
  }, [products, productQuery]);

  return (
    <div className="space-y-6" data-testid="admin-coupons-page">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-3xl">Coupons</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage backend-backed coupon codes for admin use.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} className="btn-primary w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Create Coupon
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-none overflow-y-auto p-4 sm:max-w-[920px] sm:p-6">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">
                {editingCoupon ? 'Edit Coupon' : 'Create Coupon'}
              </DialogTitle>
              <DialogDescription>
                Coupon validation stays on the backend. Checkout usage is planned for a later phase.
              </DialogDescription>
            </DialogHeader>

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="code">Coupon Code</Label>
                  <Input
                    id="code"
                    name="code"
                    value={formData.code}
                    onChange={handleChange}
                    placeholder="MARISO10"
                    className="mt-1 uppercase"
                  />
                </div>

                <div>
                  <Label htmlFor="coupon_type">Coupon Type</Label>
                  <select
                    id="coupon_type"
                    name="coupon_type"
                    value={formData.coupon_type}
                    onChange={handleChange}
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="general">General</option>
                    <option value="influencer">Influencer</option>
                    <option value="personal">Personal</option>
                    <option value="recovery">Recovery</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-sm font-medium md:self-end">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={formData.is_active}
                    onChange={handleChange}
                  />
                  Active
                </label>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Short internal description"
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div>
                  <Label htmlFor="discount_type">Discount Type</Label>
                  <select
                    id="discount_type"
                    name="discount_type"
                    value={formData.discount_type}
                    onChange={handleChange}
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="discount_value">Discount Value</Label>
                  <Input
                    id="discount_value"
                    name="discount_value"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.discount_value}
                    onChange={handleChange}
                    placeholder={formData.discount_type === 'percentage' ? '10' : '100'}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="max_discount_amount">Max Discount Amount</Label>
                  <Input
                    id="max_discount_amount"
                    name="max_discount_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.max_discount_amount}
                    onChange={handleChange}
                    disabled={formData.discount_type === 'fixed'}
                    placeholder="300"
                    className="mt-1"
                  />
                  {formData.discount_type === 'percentage' ? (
                    <p className="mt-1 text-xs text-muted-foreground">Recommended for percentage coupons.</p>
                  ) : null}
                </div>

                <div>
                  <Label htmlFor="minimum_order_amount">Minimum Order Amount</Label>
                  <Input
                    id="minimum_order_amount"
                    name="minimum_order_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.minimum_order_amount}
                    onChange={handleChange}
                    placeholder="0"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div>
                  <Label htmlFor="start_date">Valid From</Label>
                  <Input
                    id="start_date"
                    name="start_date"
                    type="datetime-local"
                    value={formData.start_date}
                    onChange={handleChange}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="end_date">Valid Until</Label>
                  <Input
                    id="end_date"
                    name="end_date"
                    type="datetime-local"
                    value={formData.end_date}
                    onChange={handleChange}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="usage_limit_total">Total Usage Limit</Label>
                  <Input
                    id="usage_limit_total"
                    name="usage_limit_total"
                    type="number"
                    min="1"
                    value={formData.usage_limit_total}
                    onChange={handleChange}
                    placeholder="100"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="usage_limit_per_customer">Limit Per Customer</Label>
                  <Input
                    id="usage_limit_per_customer"
                    name="usage_limit_per_customer"
                    type="number"
                    min="1"
                    value={formData.usage_limit_per_customer}
                    onChange={handleChange}
                    placeholder="1"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="applies_to">Applies To</Label>
                  <select
                    id="applies_to"
                    name="applies_to"
                    value={formData.applies_to}
                    onChange={handleChange}
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="all">All Products</option>
                    <option value="categories">Selected Categories</option>
                    <option value="products">Selected Products</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="influencer_name">Influencer Name</Label>
                  <Input
                    id="influencer_name"
                    name="influencer_name"
                    value={formData.influencer_name}
                    onChange={handleChange}
                    placeholder="Creator name"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="influencer_handle">Influencer Handle</Label>
                  <Input
                    id="influencer_handle"
                    name="influencer_handle"
                    value={formData.influencer_handle}
                    onChange={handleChange}
                    placeholder="@handle"
                    className="mt-1"
                  />
                </div>
              </div>

              {formData.applies_to === 'categories' ? (
                <div>
                  <Label>Applicable Categories</Label>
                  <div className="mt-2 grid max-h-52 grid-cols-1 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
                    {categories.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No categories available.</p>
                    ) : categories.map((category) => (
                      <label key={category.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted">
                        <input
                          type="checkbox"
                          checked={formData.applicable_category_ids.includes(category.id)}
                          onChange={() => toggleSelection('applicable_category_ids', category.id)}
                        />
                        <span>{category.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {formData.applies_to === 'products' ? (
                <div>
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                    <Label>Applicable Products</Label>
                    <Input
                      value={productQuery}
                      onChange={(event) => setProductQuery(event.target.value)}
                      placeholder="Search products"
                      className="w-full sm:max-w-xs"
                    />
                  </div>
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-md border p-3">
                    {filteredProducts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No products found.</p>
                    ) : filteredProducts.map((product) => (
                      <label key={product.id} className="flex items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={formData.applicable_product_ids.includes(product.id)}
                          onChange={() => toggleSelection('applicable_product_ids', product.id)}
                        />
                        <span>
                          <span className="block font-medium">{product.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {product.category_name || 'Uncategorized'}{product.sku ? ` · ${product.sku}` : ''}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formData.applicable_product_ids.length} products selected
                  </p>
                </div>
              ) : null}

              {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : editingCoupon ? 'Update Coupon' : 'Create Coupon'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl bg-white p-6 card-shadow">
        <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-heading text-xl">All Coupons</h2>
            <p className="text-sm text-muted-foreground">Review coupon validity, usage, and scope.</p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search coupons"
              className="pl-9"
            />
          </div>
        </div>

        {error && !dialogOpen ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <Table className="min-w-[1120px]">
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Applies To</TableHead>
                <TableHead>Validity</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created For</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center">Loading coupons...</TableCell>
                </TableRow>
              ) : filteredCoupons.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <BadgePercent className="h-8 w-8 text-muted-foreground/60" />
                      <span>No coupons found.</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredCoupons.map((coupon) => {
                const status = getStatus(coupon);
                return (
                  <TableRow key={coupon.id}>
                    <TableCell>
                      <div className="font-mono text-sm font-semibold">{coupon.code}</div>
                      {coupon.description ? (
                        <div className="mt-1 max-w-[180px] truncate text-xs text-muted-foreground">
                          {coupon.description}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{COUPON_TYPE_LABELS[coupon.coupon_type] || coupon.coupon_type}</TableCell>
                    <TableCell className="font-medium">{getDiscountLabel(coupon)}</TableCell>
                    <TableCell>{APPLIES_TO_LABELS[coupon.applies_to] || coupon.applies_to}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {coupon.start_date ? formatDate(coupon.start_date) : 'Any time'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        to {coupon.end_date ? formatDate(coupon.end_date) : 'No end date'}
                      </div>
                    </TableCell>
                    <TableCell>
                      {coupon.usage_limit_total
                        ? `${coupon.used_count || 0}/${coupon.usage_limit_total}`
                        : `${coupon.used_count || 0} used`}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-[180px] truncate">{getCreatedFor(coupon)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(coupon)}
                          title="Edit coupon"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleCoupon(coupon)}
                          title={coupon.is_active ? 'Disable coupon' : 'Enable coupon'}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteCoupon(coupon)}
                          title="Delete coupon"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default AdminCoupons;
