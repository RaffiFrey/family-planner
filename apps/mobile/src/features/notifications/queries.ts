import { apiQuery } from '@fp/api-client';
import { api } from '@/lib/api';

export function notificationsQuery() {
  return apiQuery(api, 'notifications', 'list', { query: { limit: 50 } });
}
