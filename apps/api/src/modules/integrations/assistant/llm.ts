import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { Inject, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import { unavailable } from '../../../common/errors.js';
import { ENV, type Env } from '../../../config/env.js';

/**
 * Model access for the assistant behind a small interface, so the rest of the module (and the
 * tests) never touch the SDK. Production uses Claude through `@anthropic-ai/sdk`.
 */

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export type LlmContent =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: ImageMediaType; data: string }
  | { type: 'pdf'; data: string };

export type LlmEffort = 'low' | 'medium' | 'high';

export interface LlmUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface LlmToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LlmToolRequest {
  /** Static instructions; cached (prompt caching) because they never change between calls. */
  system: string;
  tools: LlmToolSpec[];
  content: LlmContent[];
  effort: LlmEffort;
}

export interface LlmToolResponse {
  toolCalls: { name: string; input: unknown }[];
  text: string;
  usage: LlmUsage;
}

export interface LlmStructuredRequest<T> {
  system: string;
  content: LlmContent[];
  schema: z.ZodType<T>;
  effort: LlmEffort;
}

export interface LlmStructuredResponse<T> {
  data: T;
  usage: LlmUsage;
}

export interface LlmClient {
  callTools(req: LlmToolRequest): Promise<LlmToolResponse>;
  structured<T>(req: LlmStructuredRequest<T>): Promise<LlmStructuredResponse<T>>;
}

/** The model declined the request (stop_reason `refusal`). */
export class LlmRefusalError extends Error {
  override name = 'LlmRefusalError';
  constructor(readonly usage: LlmUsage | null) {
    super('The assistant declined this request');
  }
}

/** The model answered but the output is unusable (truncated or not matching the schema). */
export class LlmOutputError extends Error {
  override name = 'LlmOutputError';
  constructor(
    message: string,
    readonly usage: LlmUsage | null,
  ) {
    super(message);
  }
}

/** Server-side refusal fallback (routes declined requests to a suitable model by category). */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

function toBlocks(content: LlmContent[]): Anthropic.Beta.BetaContentBlockParam[] {
  return content.map((c): Anthropic.Beta.BetaContentBlockParam => {
    switch (c.type) {
      case 'text':
        return { type: 'text', text: c.text };
      case 'image':
        return { type: 'image', source: { type: 'base64', media_type: c.mediaType, data: c.data } };
      case 'pdf':
        return {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: c.data },
        };
    }
  });
}

function usageOf(m: Anthropic.Beta.BetaMessage): LlmUsage {
  return {
    model: m.model,
    inputTokens: m.usage.input_tokens + (m.usage.cache_creation_input_tokens ?? 0),
    outputTokens: m.usage.output_tokens,
    cacheReadTokens: m.usage.cache_read_input_tokens ?? 0,
  };
}

function checkStop(m: Anthropic.Beta.BetaMessage): void {
  if (m.stop_reason === 'refusal') throw new LlmRefusalError(usageOf(m));
  if (m.stop_reason === 'max_tokens')
    throw new LlmOutputError('The assistant response was truncated', usageOf(m));
}

/** Claude via the Anthropic SDK (Messages API). */
export class AnthropicLlm implements LlmClient {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  }

  private system(text: string): Anthropic.Beta.BetaTextBlockParam[] {
    return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
  }

  async callTools(req: LlmToolRequest): Promise<LlmToolResponse> {
    const m = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: req.effort },
      // Tools + system prompt are static, so they form a stable, cacheable prefix.
      system: this.system(req.system),
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
      })),
      // Forced tool choice isn't supported on current models; the prompt steers tool use.
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: toBlocks(req.content) }],
    });
    checkStop(m);
    const toolCalls: LlmToolResponse['toolCalls'] = [];
    const text: string[] = [];
    for (const block of m.content) {
      if (block.type === 'tool_use') toolCalls.push({ name: block.name, input: block.input });
      else if (block.type === 'text') text.push(block.text);
    }
    return { toolCalls, text: text.join('\n').trim(), usage: usageOf(m) };
  }

  async structured<T>(req: LlmStructuredRequest<T>): Promise<LlmStructuredResponse<T>> {
    const m = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: req.effort, format: betaZodOutputFormat(req.schema) },
      system: this.system(req.system),
      messages: [{ role: 'user', content: toBlocks(req.content) }],
    });
    checkStop(m);
    if (m.parsed_output === null || m.parsed_output === undefined)
      throw new LlmOutputError('The assistant response did not match the schema', usageOf(m));
    return { data: m.parsed_output, usage: usageOf(m) };
  }
}

/** Provider token for the model client (`null` when no API key is configured). */
export const ASSISTANT_LLM = Symbol('ASSISTANT_LLM');

export const assistantLlmProvider = {
  provide: ASSISTANT_LLM,
  inject: [ENV],
  useFactory: (env: Env): LlmClient | null =>
    env.ANTHROPIC_API_KEY ? new AnthropicLlm(env.ANTHROPIC_API_KEY, env.ASSISTANT_MODEL) : null,
};

/** Resolves the client per call; `use()` swaps it (tests inject a fake after app start). */
@Injectable()
export class AssistantLlm {
  private override: LlmClient | null = null;

  constructor(@Inject(ASSISTANT_LLM) private readonly configured: LlmClient | null) {}

  use(client: LlmClient | null): void {
    this.override = client;
  }

  get available(): boolean {
    return (this.override ?? this.configured) !== null;
  }

  client(): LlmClient {
    const c = this.override ?? this.configured;
    if (!c) throw unavailable('The assistant is not configured on this server');
    return c;
  }
}
