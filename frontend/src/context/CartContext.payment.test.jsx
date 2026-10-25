import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { CartProvider, useCart } from './CartContext';

test('buy again refreshes matching lines without doubling quantity or removing other products', () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  let cart;
  const Probe = () => { cart = useCart(); return null; };
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<CartProvider><Probe /></CartProvider>));
  act(() => {
    cart.addItem({ id: 'p', price: 10 }, 1);
    cart.addItem({ id: 'other', price: 20 }, 1);
  });
  const fresh = [{ id: 'p', price: 30, quantity: 1 }];
  act(() => cart.restoreItems(fresh));
  act(() => cart.restoreItems(fresh));
  expect(cart.items).toHaveLength(2);
  expect(cart.items.find(item => item.id === 'p')).toMatchObject({ quantity: 1, price: 30 });
  expect(cart.items.find(item => item.id === 'other')).toMatchObject({ quantity: 1, price: 20 });
  act(() => root.unmount());
  localStorage.clear();
});
