import { createApp } from './bootstrap.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const app = await createApp(env, { background: true });
await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
