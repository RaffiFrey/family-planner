import { react } from '@fp/config/eslint/react';

export default [
  { ignores: ['.next/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**'] },
  ...react({ tsconfigRootDir: import.meta.dirname }),
  {
    rules: {
      // Next.js page/layout props and server actions return promises in JSX handlers.
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
    },
  },
];
