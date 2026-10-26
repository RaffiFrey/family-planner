import type { FastifyInstance } from 'fastify';
import { toHeaders } from '../../common/auth.guard.js';
import type { Auth } from './auth.js';

/** Serves Better Auth's fetch handler at `/api/auth/*` on the Fastify instance. */
export function mountAuth(fastify: FastifyInstance, auth: Auth, publicUrl: string): void {
  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (req, reply) => {
      const url = new URL(req.url, publicUrl);
      const hasBody = req.method !== 'GET' && req.body !== undefined && req.body !== null;
      const response = await auth.handler(
        new Request(url, {
          method: req.method,
          headers: toHeaders(req),
          ...(hasBody
            ? { body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body) }
            : {}),
        }),
      );
      void reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') void reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) void reply.header('set-cookie', cookies);
      return reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
    },
  });
}
