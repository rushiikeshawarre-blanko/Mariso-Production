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

const getPriceNumber = (value) => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const getEffectiveCartItemPrice = (item) => {
  const regularPrice = getPriceNumber(item.price) ?? 0;
  const salePrice = getPriceNumber(item.sale_price) ?? getPriceNumber(item.discount_price);

  return salePrice != null && salePrice < regularPrice ? salePrice : regularPrice;
};

const normalizeCartItem = (product, quantity = 1) => {
  const normalizedQuantity = Math.max(Number(quantity) || 1, 1);
  const sellAsPack = product.sell_as_pack === true;
  const packSize = sellAsPack ? Math.max(Number(product.pack_size) || 1, 1) : 1;
  const piecesPerPack = Math.max(Number(product.pieces_per_pack) || packSize || 1, 1);
  const regularPrice = getPriceNumber(product.original_price) ?? getPriceNumber(product.price) ?? 0;
  const salePrice = getPriceNumber(product.sale_price) ?? getPriceNumber(product.discount_price);
  const isOnSale = salePrice != null && salePrice < regularPrice;

  return {
    ...product,
    price: regularPrice,
    discount_price: isOnSale ? salePrice : null,
    sale_price: isOnSale ? salePrice : null,
    is_on_sale: isOnSale,
    sell_as_pack: sellAsPack,
    pack_size: packSize,
    pack_label: product.selectedPackLabel || product.pack_label || null,
    selectedPackId: product.selectedPackId || null,
    selectedPackLabel: product.selectedPackLabel || product.pack_label || null,
    pack_multiplier: product.pack_multiplier ?? packSize,
    base_pieces_per_unit: product.base_pieces_per_unit ?? 1,
    pieces_per_pack: piecesPerPack,
    total_pieces: sellAsPack ? normalizedQuantity * piecesPerPack : null,
    effective_quantity: normalizedQuantity,
    total_units: normalizedQuantity,
    quantity: normalizedQuantity,
    gift_packaging: normalizeGiftPackaging(product, normalizedQuantity),
  };
};

const getCartItemKey = (item) => {
  if (item.variantId) return `${item.id}-${item.variantId}`;
  return `${item.id}-${item.selectedColorId || 'none'}-${item.selectedFlavorId || 'none'}-${item.selectedPackId || 'none'}`;
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
        const maxStock = Number(newItems[existingIndex].availableQuantity ?? newItems[existingIndex].variantStock ?? newItems[existingIndex].stock) || Infinity;
        const quantity = Math.min(nextQuantity, maxStock);
        const packSize = action.payload.sell_as_pack ? Math.max(Number(action.payload.pack_size) || 1, 1) : 1;
        const piecesPerPack = Math.max(Number(action.payload.pieces_per_pack) || packSize || 1, 1);

        const updatedItem = {
          ...newItems[existingIndex],
          ...action.payload,
          quantity,
          effective_quantity: quantity,
          total_units: quantity,
          total_pieces: action.payload.sell_as_pack ? quantity * piecesPerPack : null,
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
          item.availableQuantity ?? item.variantStock ?? item.stock ?? Infinity
        );
        const packSize = item.sell_as_pack ? Math.max(Number(item.pack_size) || 1, 1) : 1;
        const piecesPerPack = Math.max(Number(item.pieces_per_pack) || packSize || 1, 1);

        return {
          ...item,
          quantity,
          effective_quantity: quantity,
          total_units: quantity,
          total_pieces: item.sell_as_pack ? quantity * piecesPerPack : null,
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
      return total + (getEffectiveCartItemPrice(item) * item.quantity);
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
