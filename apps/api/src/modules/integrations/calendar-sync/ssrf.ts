import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';

/** Raised for URLs/addresses the server must not fetch (SSRF protection) or bad responses. */
export class FetchError extends Error {
  override name = 'FetchError';
  constructor(
    readonly code: 'blocked' | 'invalid_url' | 'too_large' | 'timeout' | 'http' | 'network',
    message: string,
  ) {
    super(message);
  }
}

export interface FetchPolicy {
  /** Allow loopback/private/link-local targets. Only for tests and local development. */
  allowPrivateNetworks: boolean;
  /** Allow plain http:// (tests). Production feeds must use https. */
  allowHttp: boolean;
}

export const STRICT_POLICY: FetchPolicy = { allowPrivateNetworks: false, allowHttp: false };

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(net, prefix, 'ipv4');
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
  blocked.addSubnet(net, prefix, 'ipv6');

/** True for loopback, private, link-local, CGNAT, documentation, multicast and reserved ranges. */
export function isPrivateAddress(ip: string): boolean {
  const addr = ip.replace(/^\[|\]$/g, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(addr);
  if (mapped) return isPrivateAddress(mapped[1] as string);
  const family = isIP(addr);
  if (family === 4) return blocked.check(addr, 'ipv4');
  if (family === 6) {
    // IPv4-mapped in hex form (::ffff:7f00:1).
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(addr);
    if (hex) {
      const n = (parseInt(hex[1] as string, 16) << 16) | parseInt(hex[2] as string, 16);
      return isPrivateAddress([24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.'));
    }
    return blocked.check(addr, 'ipv6');
  }
  return true; // not an IP address at all
}

/** Validates a feed URL (webcal:// is accepted as https://). */
export function normalizeFeedUrl(raw: string, policy: FetchPolicy = STRICT_POLICY): URL {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcals?:\/\//i, 'https://'));
  } catch {
    throw new FetchError('invalid_url', 'Invalid URL');
  }
  if (url.protocol !== 'https:' && !(policy.allowHttp && url.protocol === 'http:'))
    throw new FetchError('invalid_url', 'Only https:// feeds are supported');
  if (url.username || url.password)
    throw new FetchError('invalid_url', 'URLs with credentials are not supported');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host) throw new FetchError('invalid_url', 'Invalid URL');
  if (policy.allowPrivateNetworks) return url;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal'))
    throw new FetchError('blocked', 'Host not allowed');
  if (isIP(host) && isPrivateAddress(host)) throw new FetchError('blocked', 'Address not allowed');
  return url;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/** DNS lookup that refuses private addresses, used as the socket's `lookup` (no rebinding gap). */
function guardedLookup(policy: FetchPolicy) {
  return (hostname: string, options: { all?: boolean }, cb: LookupCallback): void => {
    dnsLookup(hostname, { all: true }, (err, addresses) => {
      if (err) {
        cb(err, []);
        return;
      }
      const ok = policy.allowPrivateNetworks
        ? addresses
        : addresses.filter((a) => !isPrivateAddress(a.address));
      if (ok.length === 0 || ok.length !== addresses.length) {
        cb(
          Object.assign(new Error(`Address of ${hostname} not allowed`), { code: 'EBLOCKED' }),
          [],
        );
        return;
      }
      if (options.all) cb(null, ok);
      else cb(null, (ok[0] as LookupAddress).address, (ok[0] as LookupAddress).family);
    });
  };
}

export interface FetchResult {
  status: number;
  headers: Record<string, string | undefined>;
  body: string;
  finalUrl: string;
}

export interface FetchOptions {
  policy?: FetchPolicy;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

function once(url: URL, o: Required<FetchOptions>): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      url,
      {
        method: 'GET',
        headers: { 'user-agent': 'FamilyPlaner-CalendarSync/1.0', ...o.headers },
        lookup: guardedLookup(o.policy),
        timeout: o.timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > o.maxBytes) {
            reject(new FetchError('too_large', 'Feed is too large'));
            res.destroy();
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => {
          const headers: Record<string, string | undefined> = {};
          for (const [k, v] of Object.entries(res.headers))
            headers[k] = Array.isArray(v) ? v.join(', ') : v;
          resolve({
            status: res.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString('utf8'),
            finalUrl: url.toString(),
          });
        });
        res.on('error', () => {
          reject(new FetchError('network', 'Connection closed'));
        });
      },
    );
    req.on('timeout', () => req.destroy(new FetchError('timeout', 'Feed request timed out')));
    req.on('error', (e: Error & { code?: string }) => {
      if (e instanceof FetchError) reject(e);
      else if (e.code === 'EBLOCKED') reject(new FetchError('blocked', e.message));
      else reject(new FetchError('network', e.message));
    });
    req.end();
  });
}

/**
 * GET with SSRF protection: https only, no private/loopback targets (checked at connect time
 * for every resolved address and on every redirect), size cap and timeout.
 */
export async function safeFetch(rawUrl: string, options: FetchOptions = {}): Promise<FetchResult> {
  const o: Required<FetchOptions> = {
    policy: STRICT_POLICY,
    headers: {},
    timeoutMs: 15_000,
    maxBytes: 5 * 1024 * 1024,
    maxRedirects: 3,
    ...options,
  };
  let url = normalizeFeedUrl(rawUrl, o.policy);
  for (let hop = 0; ; hop++) {
    const res = await once(url, o);
    const location = res.headers.location;
    if ([301, 302, 303, 307, 308].includes(res.status) && location) {
      if (hop >= o.maxRedirects) throw new FetchError('http', 'Too many redirects');
      url = normalizeFeedUrl(new URL(location, url).toString(), o.policy);
      continue;
    }
    return res;
  }
}
