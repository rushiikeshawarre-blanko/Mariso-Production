import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000'}/api`;

const axiosInstance = axios.create({
  baseURL: API,
});

axiosInstance.interceptors.request.use(config => {
  const token = localStorage.getItem('mariso_token');
  config.headers = config.headers || {};
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Products
export const getProducts = async (params = {}) => {
  try {
    const response = await axiosInstance.get(`/products`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching products:', error);
    throw error;
  }
};

export const getProductsByCategory = async (categoryId, params = {}) => {
  try {
    const response = await axiosInstance.get(`/products`, { 
      params: { ...params, category_id: categoryId }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching products by category:', error);
    throw error;
  }
};

export const getFeaturedProducts = async () => {
  try {
    const response = await axiosInstance.get(`/products/featured`);
    return response.data;
  } catch (error) {
    console.error('Error fetching featured products:', error);
    throw error;
  }
};

export const getBestsellers = async () => {
  try {
    const response = await axiosInstance.get(`/products/bestsellers`);
    return response.data;
  } catch (error) {
    console.error('Error fetching bestsellers:', error);
    throw error;
  }
};

export const getProduct = async (id) => {
  try {
    const response = await axiosInstance.get(`/products/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching product:', error);
    throw error;
  }
};

// Categories
export const getCategories = async () => {
  try {
    const response = await axiosInstance.get(`/categories`);
    return response.data;
  } catch (error) {
    console.error('Error fetching categories:', error);
    throw error;
  }
};

export const getCategory = async (id) => {
  try {
    const response = await axiosInstance.get(`/categories/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching category:', error);
    throw error;
  }
};

// Orders
export const createOrder = async (orderData) => {
  try {
    const response = await axiosInstance.post(`/orders`, orderData);
    return response.data;
  } catch (error) {
    console.error('Error creating order:', error);
    throw error;
  }
};

export const getUserOrders = async () => {
  try {
    const response = await axiosInstance.get(`/orders`);
    return response.data;
  } catch (error) {
    console.error('Error fetching user orders:', error);
    throw error;
  }
};

export const getOrder = async (id) => {
  try {
    const response = await axiosInstance.get(`/orders/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching order:', error);
    throw error;
  }
};

// Wishlist
export const addToWishlist = async (productId) => {
  try {
    const response = await axiosInstance.post(`/wishlist`, { product_id: productId });
    return response.data;
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    throw error;
  }
};

export const removeFromWishlist = async (productId) => {
  try {
    const response = await axiosInstance.delete(`/wishlist/${productId}`);
    return response.data;
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    throw error;
  }
};

export const getWishlist = async () => {
  try {
    const response = await axiosInstance.get(`/wishlist`);
    return response.data;
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    throw error;
  }
};

// Addresses
export const addAddress = async (addressData) => {
  try {
    const response = await axiosInstance.post(`/addresses`, addressData);
    return response.data;
  } catch (error) {
    console.error('Error adding address:', error);
    throw error;
  }
};

export const deleteAddress = async (addressId) => {
  try {
    const response = await axiosInstance.delete(`/addresses/${addressId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting address:', error);
    throw error;
  }
};

export const getAddresses = async () => {
  try {
    const response = await axiosInstance.get(`/addresses`);   
    return response.data;
  } catch (error) {
    console.error('Error fetching addresses:', error);
    throw error;
  }
};

// Admin APIs
export const getDashboardStats = async () => {
  try {
    const response = await axiosInstance.get(`/admin/dashboard`);
    return response.data;
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    throw error;
  }
};

export const getAllOrders = async (status = null) => {
  try {
    const params = status ? { status } : {};
    const response = await axiosInstance.get(`/admin/orders`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching all orders:', error);
    throw error;
  }
};

export const updateOrderStatus = async (orderId, status) => {
  try {
    const response = await axiosInstance.put(`/admin/orders/${orderId}/status`, { status });
    return response.data;
  } catch (error) {
    console.error('Error updating order status:', error);
    throw error;
  }
};

export const getCustomers = async () => {
  try {
    const response = await axiosInstance.get(`/admin/customers`);
    return response.data;
  } catch (error) {
    console.error('Error fetching customers:', error);
    throw error;
  }
};

// Admin Product Management
export const createProduct = async (productData) => {
  try {
    const response = await axiosInstance.post(`/admin/products`, productData);
    return response.data;
  } catch (error) {
    console.error('Error creating product:', error);
    throw error;
  }
};

export const updateProduct = async (productId, productData) => {
  try {
    const response = await axiosInstance.put(`/admin/products/${productId}`, productData);
    return response.data;
  } catch (error) {
    console.error('Error updating product:', error);
    throw error;
  }
};

export const deleteProduct = async (productId) => {
  const response = await axiosInstance.delete(`/admin/products/${productId}`);
  return response.data;
};

export const generateProductVariants = async (productId) => {
  try {
    const response = await axiosInstance.post(`/admin/products/${productId}/generate-variants`);
    return response.data;
  } catch (error) {
    console.error('Error generating product variants:', error);
    throw error;
  }
};

// Admin Category Management
export const createCategory = async (categoryData) => {
  const response = await axiosInstance.post(`/admin/categories`, categoryData);
  return response.data;
};

export const updateCategory = async (categoryId, categoryData) => {
  const response = await axiosInstance.put(`/admin/categories/${categoryId}`, categoryData);
  return response.data;
};

export const deleteCategory = async (categoryId) => {
  const response = await axiosInstance.delete(`/admin/categories/${categoryId}`);
  return response.data;
};

// Seed database
export const seedDatabase = async () => {
  const response = await axiosInstance.post(`/seed`);
  return response.data;
};

// Upload image
export const uploadImage = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await axiosInstance.post(`/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};
