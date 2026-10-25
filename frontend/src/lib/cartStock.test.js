import { getCartAvailableStock as stock } from './cartStock';
test('colour and fragrance selections without variants use base inventory', () => {
  expect(stock({stock:20, variants:[]}, {selectedColorId:'white'})).toBe(20);
  expect(stock({stock:7}, {selectedFlavorId:'rose'})).toBe(7);
});
test('missing products and removed variants remain unavailable', () => {
  expect(stock(null, {})).toBe(0);
  expect(stock({stock:20, variants:[]}, {variantId:'removed'})).toBe(0);
});
test('variant inventory wins over base stock and inactive variants are blocked', () => {
  const product = {stock:20, variants:[{id:'v', color_id:'white', stock:0}, {id:'off', stock:9, is_active:false}]};
  expect(stock(product, {variantId:'v'})).toBe(0);
  expect(stock(product, {variantId:'off'})).toBe(0);
  expect(stock(product, {selectedColorId:'black'})).toBe(0);
});
test('legacy selections match the exact pack combination', () => {
  const product = {variants:[{color_id:'white', pack_option_id:'single', stock:0}, {color_id:'white', pack_option_id:'pair', stock:3}]};
  expect(stock(product, {selectedColorId:'white', selectedPackId:'pair'})).toBe(3);
});
