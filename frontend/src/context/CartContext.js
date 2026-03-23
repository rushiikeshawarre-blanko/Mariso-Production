import React, { createContext, useContext, useReducer, useEffect } from 'react';

const CartContext = createContext();

const normalizeCartItem = (product, quantity = 1) => ({
  ...product,
  price: product.original_price ?? product.price,
  discount_price: product.discount_price ?? null,
  sale_price: product.sale_price ?? null,
  is_on_sale: Boolean(product.is_on_sale && (product.sale_price != null || product.discount_price != null)),
  quantity,
});

const getCartItemKey = (item) => {
  return `${item.id}-${item.selectedColorId || 'none'}-${item.selectedFlavorId || 'none'}`;
};

const cartReducer = (state, action) => {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existingIndex = state.items.findIndex(
        item => getCartItemKey(item) === getCartItemKey(action.payload)
      );
      if (existingIndex >= 0) {
        const newItems = [...state.items];
        newItems[existingIndex] = {
          ...newItems[existingIndex],
          ...action.payload,
          quantity: newItems[existingIndex].quantity + (action.payload.quantity || 1),
        };
        return { ...state, items: newItems };
      }
      return { 
        ...state, 
        items: [...state.items, action.payload]
      };
    }
    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter(item => getCartItemKey(item) !== action.payload)
      };
    case 'UPDATE_QUANTITY': {
      const newItems = state.items.map(item =>
        getCartItemKey(item) === action.payload.id
          ? { ...item, quantity: action.payload.quantity }
          : item
      );
      return { ...state, items: newItems.filter(item => item.quantity > 0) };
    }
    case 'CLEAR_CART':
      return { ...state, items: [] };
    case 'LOAD_CART':
      return { ...state, items: action.payload };
    default:
      return state;
  }
};

export const CartProvider = ({ children }) => {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('mariso_cart');
    if (savedCart) {
      const parsedCart = JSON.parse(savedCart).map(item => normalizeCartItem(item, item.quantity || 1));
      dispatch({ type: 'LOAD_CART', payload: parsedCart });
    }
  }, []);

  // Save cart to localStorage on change
  useEffect(() => {
    localStorage.setItem('mariso_cart', JSON.stringify(state.items));
  }, [state.items]);

  const addItem = (product, quantity = 1) => {
    const normalizedItem = normalizeCartItem(product, quantity);
    dispatch({ type: 'ADD_ITEM', payload: normalizedItem });
  };

  const removeItem = (cartItemKey) => {
    dispatch({ type: 'REMOVE_ITEM', payload: cartItemKey });
  };

  const updateQuantity = (cartItemKey, quantity) => {
    if (quantity <= 0) {
      removeItem(cartItemKey);
    } else {
      dispatch({ type: 'UPDATE_QUANTITY', payload: { id: cartItemKey, quantity } });
    }
  };

  const clearCart = () => {
    dispatch({ type: 'CLEAR_CART' });
  };

  const getCartTotal = () => {
    return state.items.reduce((total, item) => {
      const discountedPrice =
        item.is_on_sale && (item.sale_price || item.discount_price)
          ? (item.sale_price || item.discount_price)
          : item.price;
      return total + (discountedPrice * item.quantity);
    }, 0);
  };

  const getCartCount = () => {
    return state.items.reduce((count, item) => count + item.quantity, 0);
  };

  return (
    <CartContext.Provider value={{
      items: state.items,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      getCartTotal,
      getCartCount
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
