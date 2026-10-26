import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { badRequest } from '../../../common/errors.js';
import { ENV, type Env } from '../../../config/env.js';

const BLOCKED = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  BLOCKED.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  BLOCKED.addSubnet(net, prefix, 'ipv6');

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').split('%')[0] ?? '';
  const family = isIP(ip);
  if (family === 4) return BLOCKED.check(ip, 'ipv4');
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return BLOCKED.check(mapped[1] as string, 'ipv4');
    return BLOCKED.check(ip, 'ipv6');
  }
  return true;
}

export class BlockedAddressError extends Error {}

export interface FetchedPage {
  html: string;
  url: string;
}

/**
 * Fetches recipe pages for URL import with SSRF protection: http(s) only, every resolved address
 * (including after redirects) must be public, plus a timeout and a response size limit.
 */
@Injectable()
export class RecipeFetcher {
  /** Test hook: allows loopback/private targets. Must stay false in production. */
  allowPrivateNetworks = false;
  timeoutMs = 10_000;
  maxBytes = 3 * 1024 * 1024;
  maxRedirects = 3;

  constructor(@Optional() @Inject(ENV) env?: Env) {
    this.allowPrivateNetworks = env?.NODE_ENV === 'test' && env.RECIPE_FETCH_ALLOW_PRIVATE;
  }

  private readonly lookup: LookupFunction = (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
      if (err) {
        callback(err, '', 4);
        return;
      }
      const list = addresses;
      if (
        !this.allowPrivateNetworks &&
        (list.length === 0 || list.some((a) => isPrivateAddress(a.address)))
      ) {
        callback(new BlockedAddressError(`${hostname} resolves to a non-public address`), '', 4);
        return;
      }
      if (options.all) callback(null, list);
      else {
        const first = list[0] as LookupAddress;
        callback(null, first.address, first.family);
      }
    });
  };

  async fetchHtml(rawUrl: string): Promise<FetchedPage> {
    let url = this.validate(rawUrl);
    for (let hop = 0; hop <= this.maxRedirects; hop++) {
      const res = await this.get(url);
      if (res.status >= 300 && res.status < 400 && res.location) {
        url = this.validate(new URL(res.location, url).toString());
        continue;
      }
      if (res.status !== 200 || res.body === null)
        throw badRequest(`The page answered with HTTP ${String(res.status)}`, 'import_failed');
      return { html: res.body, url: url.toString() };
    }
    throw badRequest('Too many redirects', 'import_failed');
  }

  private validate(raw: string): URL {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw badRequest('Invalid URL', 'import_failed');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw badRequest('Only http and https URLs can be imported', 'import_blocked');
    if (url.username || url.password)
      throw badRequest('URLs with credentials are not allowed', 'import_blocked');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    // IP literals skip DNS (and thus the guarded lookup), so check them here.
    if (isIP(host) && !this.allowPrivateNetworks && isPrivateAddress(host))
      throw badRequest('This address cannot be imported from', 'import_blocked');
    if (
      !this.allowPrivateNetworks &&
      /^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)
    )
      throw badRequest('This address cannot be imported from', 'import_blocked');
    return url;
  }

  private get(url: URL): Promise<{ status: number; location: string | null; body: string | null }> {
    const client = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const req = client.request(
        url,
        {
          method: 'GET',
          lookup: this.lookup,
          timeout: this.timeoutMs,
          headers: {
            'user-agent': 'FamilyPlanerRecipeImport/1.0 (+https://family-planer.app)',
            accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
            'accept-language': 'de,en;q=0.8',
          },
        },
        (res) => {
          this.read(res).then(resolve, reject);
        },
      );
      const deadline = setTimeout(() => req.destroy(new Error('timeout')), this.timeoutMs);
      req.on('close', () => {
        clearTimeout(deadline);
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (e) => {
        clearTimeout(deadline);
        reject(
          e instanceof BlockedAddressError
            ? badRequest('This address cannot be imported from', 'import_blocked')
            : badRequest(`The page could not be loaded (${e.message})`, 'import_failed'),
        );
      });
      req.end();
    });
  }

  private read(
    res: IncomingMessage,
  ): Promise<{ status: number; location: string | null; body: string | null }> {
    const status = res.statusCode ?? 0;
    const location = typeof res.headers.location === 'string' ? res.headers.location : null;
    if (status !== 200) {
      res.resume();
      return Promise.resolve({ status, location, body: null });
    }
    const type = res.headers['content-type'] ?? '';
    if (type && !/html|xml|json|text\/plain/i.test(type)) {
      res.destroy();
      return Promise.reject(badRequest('The URL is not a web page', 'import_failed'));
    }
    const length = Number(res.headers['content-length'] ?? 0);
    if (length > this.maxBytes) {
      res.destroy();
      return Promise.reject(badRequest('The page is too large', 'import_failed'));
    }
    const charset = /charset=([\w-]+)/i.exec(type)?.[1] ?? 'utf-8';
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > this.maxBytes) {
          res.destroy();
          reject(badRequest('The page is too large', 'import_failed'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('error', (e) => {
        reject(badRequest(`The page could not be loaded (${e.message})`, 'import_failed'));
      });
      res.on('end', () => {
        let decoder: TextDecoder;
        try {
          decoder = new TextDecoder(charset);
        } catch {
          decoder = new TextDecoder('utf-8');
        }
        resolve({ status, location, body: decoder.decode(Buffer.concat(chunks)) });
      });
    });
  }
}
