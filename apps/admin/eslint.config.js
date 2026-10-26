import { react } from '@fp/config/eslint/react';

export default [
  ...react({ tsconfigRootDir: import.meta.dirname }),
  { ignores: ['next-env.d.ts', 'playwright-report/**', 'test-results/**'] },
  {
    files: ['src/app/**/{page,layout,route,error,loading,not-found}.tsx', 'src/app/**/route.ts'],
    rules: {
      // Next file conventions export async components / handlers without awaiting anything in some cases.
      '@typescript-eslint/require-await': 'off',
    },
  },
];
