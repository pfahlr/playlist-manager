/**
 * ESLint configuration for React Native / Expo mobile app
 */

module.exports = {
  root: true,
  extends: ['expo'],
  ignorePatterns: [
    'node_modules/',
    '.expo/',
    'dist/',
    'coverage/',
  ],
  rules: {
    // Allow console for mobile debugging
    'no-console': 'off',
  },
};
