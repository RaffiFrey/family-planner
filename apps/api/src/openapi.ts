import { mkdirSync, writeFileSync } from 'node:fs';
import { buildOpenApi } from './modules/health/docs.controller.js';

/** Writes the OpenAPI documents to `openapi/` (CI publishes them as artifacts). */
const url = process.env.API_PUBLIC_URL ?? 'http://localhost:4000';
mkdirSync('openapi', { recursive: true });
writeFileSync('openapi/api.json', `${JSON.stringify(buildOpenApi(url, 'api'), null, 2)}\n`);
writeFileSync('openapi/admin.json', `${JSON.stringify(buildOpenApi(url, 'admin'), null, 2)}\n`);
console.log('OpenAPI written to openapi/');
