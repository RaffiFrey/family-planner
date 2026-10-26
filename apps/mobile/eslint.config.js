const { react } = require('@fp/config/eslint/react');

module.exports = [
  {
    ignores: [
      'dist-check/**',
      'dist-web/**',
      'e2e/**',
      'test-results/**',
      'playwright-report/**',
      'dist/**',
      'node_modules/**',
      '.expo/**',
      'expo-env.d.ts',
      'nativewind-env.d.ts',
    ],
  },
  ...react({ tsconfigRootDir: __dirname }),
];
