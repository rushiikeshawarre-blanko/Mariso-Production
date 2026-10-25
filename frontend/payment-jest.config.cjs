module.exports = {
  testEnvironment: 'jsdom',
  // CRA's Jest 27 does not resolve this router version's package exports.
  moduleNameMapper: { '^react-router-dom$': require.resolve('react-router-dom') },
  testMatch: ['<rootDir>/src/lib/cartStock.test.js', '<rootDir>/src/context/CartContext.payment.test.jsx', '<rootDir>/src/lib/razorpay.test.js', '<rootDir>/src/pages/RazorpayReturnPage.test.jsx'],
  transform: { '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-react-app'] }] },
};
