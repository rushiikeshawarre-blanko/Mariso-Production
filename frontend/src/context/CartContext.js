import React, { createContext, useContext, useReducer, useEffect } from 'react';

const CartContext = createContext();

const limitGiftMessage = (message) => {
  const value = String(message || '');
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.length > 150 ? words.slice(0, 150).join(' ') : value;
};

const normalizeGiftPackaging = (item, quantity) => {
  if (item.show_gift_packaging !== true || item.gift_packaging?.selected !== true) {
    return null;
  }

  return {
    selected: true,
    option_id: item.gift_packaging.option_id || null,
    quantity: Math.min(
      Math.max(Number(item.gift_packaging.quantity) || 1, 1),
      quantity
    ),
    message: limitGiftMessage(item.gift_packaging.message),
  };
};

const normalizeCartItem = (product, quantity = 1) => {
  const normalizedQuantity = Math.max(Number(quantity) || 1, 1);

  return {
    ...product,
    price: Number(product.original_price ?? product.price) || 0,
    discount_price: product.discount_price != null ? Number(product.discount_price) : null,
    sale_price: product.sale_price != null ? Number(product.sale_price) : null,
    is_on_sale: Boolean(product.is_on_sale && (product.sale_price != null || product.discount_price != null)),
    quantity: normalizedQuantity,
    gift_packaging: normalizeGiftPackaging(product, normalizedQuantity),
  };
};

const getCartItemKey = (item) => {
  if (item.variantId) return `${item.id}-${item.variantId}`;
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
        const nextQuantity = newItems[existingIndex].quantity + (action.payload.quantity || 1); 
        const maxStock = Number(newItems[existingIndex].variantStock ?? newItems[existingIndex].stock) || Infinity;
        const quantity = Math.min(nextQuantity, maxStock);

        const updatedItem = {
          ...newItems[existingIndex],
          ...action.payload,
          quantity,
          gift_packaging: newItems[existingIndex].gift_packaging,
        };
        updatedItem.gift_packaging = normalizeGiftPackaging(updatedItem, quantity);
        newItems[existingIndex] = updatedItem;

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
      const newItems = state.items.map(item => {
        if (getCartItemKey(item) !== action.payload.id) {
          return item;
        }

        const quantity = Math.min(
          action.payload.quantity,
          item.variantStock ?? item.stock ?? Infinity
        );

        return {
          ...item,
          quantity,
          gift_packaging: normalizeGiftPackaging(item, quantity),
        };
      });
      return { ...state, items: newItems.filter(item => item.quantity > 0) };
    }
    case 'UPDATE_GIFT_PACKAGING': {
      return {
        ...state,
        items: state.items.map(item => {
          if (getCartItemKey(item) !== action.payload.id) {
            return item;
          }

          return {
            ...item,
            gift_packaging: normalizeGiftPackaging(
              { ...item, gift_packaging: action.payload.giftPackaging },
              item.quantity
            ),
          };
        }),
      };
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
    try {
      const savedCart = localStorage.getItem('mariso_cart');
      if (savedCart) {
        const parsedCart = JSON.parse(savedCart).map(item =>
          normalizeCartItem(item, item.quantity || 1)
        );
        dispatch({ type: 'LOAD_CART', payload: parsedCart });
      }
    } catch (error) {
      console.error('Failed to load cart from localStorage:', error);
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

  const updateGiftPackaging = (cartItemKey, giftPackaging) => {
    dispatch({
      type: 'UPDATE_GIFT_PACKAGING',
      payload: { id: cartItemKey, giftPackaging },
    });
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
      updateGiftPackaging,
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
