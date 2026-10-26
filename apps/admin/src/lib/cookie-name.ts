import { IS_PROD } from './env';

/**
 * The staff bearer token lives only in an httpOnly cookie; browser JS never sees it.
 * In production the `__Host-` prefix pins it to this origin, HTTPS and path `/`.
 */
export const SESSION_COOKIE = IS_PROD ? '__Host-fp_admin_session' : 'fp_admin_session';
