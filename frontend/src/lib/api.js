import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Products
export const getProducts = async (params = {}) => {
  const response = await axios.get(`${API}/products`, { params });
  return response.data;
};

export const getFeaturedProducts = async () => {
  const response = await axios.get(`${API}/products/featured`);
  return response.data;
};

export const getBestsellers = async () => {
  const response = await axios.get(`${API}/products/bestsellers`);
  return response.data;
};

export const getProduct = async (id) => {
  const response = await axios.get(`${API}/products/${id}`);
  return response.data;
};

// Categories
export const getCategories = async () => {
  const response = await axios.get(`${API}/categories`);
  return response.data;
};

export const getCategory = async (id) => {
  const response = await axios.get(`${API}/categories/${id}`);
  return response.data;
};

// Orders
export const createOrder = async (orderData) => {
  const response = await axios.post(`${API}/orders`, orderData);
  return response.data;
};

export const getUserOrders = async () => {
  const response = await axios.get(`${API}/orders`);
  return response.data;
};

export const getOrder = async (id) => {
  const response = await axios.get(`${API}/orders/${id}`);
  return response.data;
};

// Wishlist
export const addToWishlist = async (productId) => {
  const response = await axios.post(`${API}/wishlist`, { product_id: productId });
  return response.data;
};

export const removeFromWishlist = async (productId) => {
  const response = await axios.delete(`${API}/wishlist/${productId}`);
  return response.data;
};

export const getWishlist = async () => {
  const response = await axios.get(`${API}/wishlist`);
  return response.data;
};

// Addresses
export const addAddress = async (addressData) => {
  const response = await axios.post(`${API}/addresses`, addressData);
  return response.data;
};

export const deleteAddress = async (addressId) => {
  const response = await axios.delete(`${API}/addresses/${addressId}`);
  return response.data;
};

// Admin APIs
export const getDashboardStats = async () => {
  const response = await axios.get(`${API}/admin/dashboard`);
  return response.data;
};

export const getAllOrders = async (status = null) => {
  const params = status ? { status } : {};
  const response = await axios.get(`${API}/admin/orders`, { params });
  return response.data;
};

export const updateOrderStatus = async (orderId, status) => {
  const response = await axios.put(`${API}/admin/orders/${orderId}/status`, { status });
  return response.data;
};

export const getCustomers = async () => {
  const response = await axios.get(`${API}/admin/customers`);
  return response.data;
};

// Admin Product Management
export const createProduct = async (productData) => {
  const response = await axios.post(`${API}/admin/products`, productData);
  return response.data;
};

export const updateProduct = async (productId, productData) => {
  const response = await axios.put(`${API}/admin/products/${productId}`, productData);
  return response.data;
};

export const deleteProduct = async (productId) => {
  const response = await axios.delete(`${API}/admin/products/${productId}`);
  return response.data;
};

// Admin Category Management
export const createCategory = async (categoryData) => {
  const response = await axios.post(`${API}/admin/categories`, categoryData);
  return response.data;
};

export const updateCategory = async (categoryId, categoryData) => {
  const response = await axios.put(`${API}/admin/categories/${categoryId}`, categoryData);
  return response.data;
};

export const deleteCategory = async (categoryId) => {
  const response = await axios.delete(`${API}/admin/categories/${categoryId}`);
  return response.data;
};

// Seed database
export const seedDatabase = async () => {
  const response = await axios.post(`${API}/seed`);
  return response.data;
};

// Upload image
export const uploadImage = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await axios.post(`${API}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};
