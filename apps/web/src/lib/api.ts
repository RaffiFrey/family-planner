import { createApi } from '@fp/api-client';
import { API_URL } from './env';

/** Typed API client; the Better Auth session cookie travels via `credentials: 'include'`. */
export const api = createApi({ baseUrl: API_URL, credentials: 'include' });
