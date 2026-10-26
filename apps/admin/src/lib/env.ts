/** Server-side configuration. Never import from client components. */
export const ADMIN_API_URL = (process.env.ADMIN_API_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);
export const IS_PROD = process.env.NODE_ENV === 'production';
