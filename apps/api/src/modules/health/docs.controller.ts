import { Controller, Get, Header, Inject } from '@nestjs/common';
import { adminApiContract, apiContract, generateOpenApi } from '@fp/contracts';
import { ENV, type Env } from '../../config/env.js';

export function buildOpenApi(publicUrl: string, which: 'api' | 'admin' = 'api') {
  return generateOpenApi(which === 'api' ? apiContract : adminApiContract, {
    title: which === 'api' ? 'Family Planer API' : 'Family Planer Admin API',
    version: '1.0.0',
    description: 'Generated from @fp/contracts. Errors use RFC 9457 problem details.',
    servers: [{ url: publicUrl }],
  });
}

/** OpenAPI documents and an interactive reference (Scalar) for the customer API. */
@Controller()
export class DocsController {
  private readonly doc: unknown;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.doc = buildOpenApi(env.API_PUBLIC_URL);
  }

  @Get('/openapi.json')
  openapi(): unknown {
    return this.doc;
  }

  @Get('/docs')
  @Header('content-type', 'text/html; charset=utf-8')
  docs(): string {
    return `<!doctype html><html><head><title>Family Planer API</title><meta charset="utf-8"></head>
<body><script id="api-reference" data-url="/openapi.json"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.25.0"></script></body></html>`;
  }
}
