import axios from 'axios';

const rawBackendUrl = process.env.REACT_APP_BACKEND_URL;
const isDev = process.env.NODE_ENV === 'development';

if (!rawBackendUrl && !isDev) {
  throw new Error('Missing REACT_APP_BACKEND_URL in production.');
}

const backendUrl = rawBackendUrl || 'http://localhost:8000';
const API = `${backendUrl}/api`;

const axiosInstance = axios.create({
  baseURL: API,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetryPublicGet = (error) => {
  if (!error.response) return true;
  const status = error.response.status;
  return status >= 500 || status === 429;
};

const getWithRetry = async (url, config = {}, retries = 2, backoffMs = 300) => {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await axiosInstance.get(url, config);
      return response.data;
    } catch (error) {
      const canRetry = attempt < retries && shouldRetryPublicGet(error);
      if (!canRetry) {
        throw error;
      }
      await sleep(backoffMs * (attempt + 1));
    }
  }
};

let accessTokenGetter = null;

export const setAccessTokenGetter = (getter) => {
  accessTokenGetter = getter;
};

axiosInstance.interceptors.request.use(
  async (config) => {
    config.headers = config.headers || {};

    if (accessTokenGetter) {
      try {
        const token = await accessTokenGetter();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        console.warn('Failed to get Auth0 access token:', error);
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Products
export const getProducts = async (params = {}) => {
  try {
    return await getWithRetry(`/products`, { params });
  } catch (error) {
    console.error('Error fetching products:', error);
    throw error;
  }
};

export const getAdminProducts = async (params = {}) => {
  try {
    const response = await axiosInstance.get(`/products/admin`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching admin products:', error);
    throw error;
  }
};


export const searchProducts = async (query) => {
  const trimmedQuery = query?.trim().toLowerCase();

  if (!trimmedQuery) {
    return [];
  }

  const products = await getProducts();

  return (products || [])
    .filter((product) =>
      product.name?.toLowerCase().includes(trimmedQuery) ||
      product.description?.toLowerCase().includes(trimmedQuery) ||
      product.short_description?.toLowerCase().includes(trimmedQuery) ||
      product.sku?.toLowerCase().includes(trimmedQuery)
    )
    .slice(0, 6);
};

export const getProductsByCategory = async (categoryId, params = {}) => {
  try {
    return await getWithRetry(`/products`, {
      params: { ...params, category_id: categoryId }
    });
  } catch (error) {
    console.error('Error fetching products by category:', error);
    throw error;
  }
};

export const getFeaturedProducts = async () => {
  try {
    return await getWithRetry(`/products/featured`);
  } catch (error) {
    console.error('Error fetching featured products:', error);
    throw error;
  }
};

export const getBestsellers = async () => {
  try {
    return await getWithRetry(`/products/bestsellers`);
  } catch (error) {
    console.error('Error fetching bestsellers:', error);
    throw error;
  }
};

export const getProduct = async (id) => {
  try {
    return await getWithRetry(`/products/${id}`);
  } catch (error) {
    console.error('Error fetching product:', error);
    throw error;
  }
};

// Categories
export const getCategories = async () => {
  try {
    return await getWithRetry(`/categories`);
  } catch (error) {
    console.error('Error fetching categories:', error);
    throw error;
  }
};

export const getCategory = async (id) => {
  try {
    return await getWithRetry(`/categories/${id}`);
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
export const getDashboardStats = async (params = {}) => {
  try {
    const response = await axiosInstance.get(`/admin/dashboard`, {
      params,
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    throw error;
  }
};

export const exportOrdersExcel = async (params = {}) => {
  try {
    const response = await axiosInstance.get(`/admin/export-orders`, {
      params,
      responseType: 'blob',
    });
    return response;
  } catch (error) {
    console.error('Error exporting orders:', error);
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
    const response = await axiosInstance.post(`/products/admin`, productData);
    return response.data;
  } catch (error) {
    console.error('Error creating product:', error);
    throw error;
  }
};

export const updateProduct = async (productId, productData) => {
  try {
    const response = await axiosInstance.put(`/products/admin/${productId}`, productData);
    return response.data;
  } catch (error) {
    console.error('Error updating product:', error);
    throw error;
  }
};

export const deleteProduct = async (productId) => {
  const response = await axiosInstance.delete(`/products/admin/${productId}`);
  return response.data;
};

export const generateProductVariants = async (productId) => {
  try {
    const response = await axiosInstance.post(`/products/admin/${productId}/generate-variants`);
    return response.data;
  } catch (error) {
    console.error('Error generating product variants:', error);
    throw error;
  }
};

// Admin Category Management
export const createCategory = async (categoryData) => {
  const response = await axiosInstance.post(`/categories/admin`, categoryData);
  return response.data;
};

export const updateCategory = async (categoryId, categoryData) => {
  const response = await axiosInstance.put(`/categories/admin/${categoryId}`, categoryData);
  return response.data;
};

export const deleteCategory = async (categoryId) => {
  const response = await axiosInstance.delete(`/categories/admin/${categoryId}`);
  return response.data;
};

// Content Pages & FAQs


export const getAdminContentPages = async (params = {}) => {
  try {
    const response = await axiosInstance.get(`/content/pages/admin`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching admin content pages:', error);
    throw error;
  }
};

export const getContentPages = async (params = {}) => {
  try {
    const response = await axiosInstance.get(`/content/pages`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching content pages:', error);
    throw error;
  }
};

export const getContentPageBySlug = async (slug) => {
  try {
    const response = await axiosInstance.get(`/content/pages/${slug}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching content page:', error);
    throw error;
  }
};

export const createContentPage = async (pageData) => {
  try {
    const response = await axiosInstance.post(`/content/pages/admin`, pageData);
    return response.data;
  } catch (error) {
    console.error('Error creating content page:', error);
    throw error;
  }
};

export const updateContentPage = async (pageId, pageData) => {
  try {
    const response = await axiosInstance.put(`/content/pages/admin/${pageId}`, pageData);
    return response.data;
  } catch (error) {
    console.error('Error updating content page:', error);
    throw error;
  }
};

export const deleteContentPage = async (pageId) => {
  try {
    const response = await axiosInstance.delete(`/content/pages/admin/${pageId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting content page:', error);
    throw error;
  }
};

export const getAdminFaqs = async (params = {}) => {
  try {
    const response = await axiosInstance.get(`/content/faqs/admin`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching admin FAQs:', error);
    throw error;
  }
};

export const getFaqs = async (params = {}) => {
  try {
    const response = await axiosInstance.get(`/content/faqs`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching FAQs:', error);
    throw error;
  }
};

export const getHomepageFaqs = async () => {
  try {
    const response = await axiosInstance.get(`/content/faqs/homepage`);
    return response.data;
  } catch (error) {
    console.error('Error fetching homepage FAQs:', error);
    throw error;
  }
};

export const createFaq = async (faqData) => {
  try {
    const response = await axiosInstance.post(`/content/faqs/admin`, faqData);
    return response.data;
  } catch (error) {
    console.error('Error creating FAQ:', error);
    throw error;
  }
};

export const updateFaq = async (faqId, faqData) => {
  try {
    const response = await axiosInstance.put(`/content/faqs/admin/${faqId}`, faqData);
    return response.data;
  } catch (error) {
    console.error('Error updating FAQ:', error);
    throw error;
  }
};

export const deleteFaq = async (faqId) => {
  try {
    const response = await axiosInstance.delete(`/content/faqs/admin/${faqId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting FAQ:', error);
    throw error;
  }
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

