import { randomBytes, timingSafeEqual } from 'node:crypto';

export interface Published {
  token: string;
  expiresAt: number;
  json: string;
}

export const SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:",
};

export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private limit = 10, private windowMs = 600_000, private maxKeys = 10_000) {}

  get size(): number {
    return this.hits.size;
  }

  blocked(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length) this.hits.set(key, recent);
    else this.hits.delete(key);
    return recent.length >= this.limit;
  }

  fail(key: string, now: number): void {
    this.hits.set(key, [...(this.hits.get(key) ?? []), now]);
    if (this.hits.size <= this.maxKeys) return;
    for (const [k, times] of this.hits) if (now - times[times.length - 1] >= this.windowMs) this.hits.delete(k);
    // Still too many live keys: drop the oldest (Map keeps insertion order).
    for (const k of this.hits.keys()) {
      if (this.hits.size <= this.maxKeys) break;
      this.hits.delete(k);
    }
  }
}

export const newToken = () => randomBytes(32).toString('hex');

export function tokenEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

const clientKey = (address = '') => address.replace(/:\d+$/, '');

export function createHttpHandler(deps: { current(): Published | null; html(): string | null; now(): number; limiter?: RateLimiter }) {
  const limiter = deps.limiter ?? new RateLimiter();
  return (req: FxHttpRequest, res: FxHttpResponse) => {
    const send = (code: number, body: string, type = 'text/plain; charset=utf-8') => {
      res.writeHead(code, { ...SECURITY_HEADERS, 'Content-Type': type });
      res.send(body);
    };
    if (req.method !== 'GET') return send(405, 'Method not allowed');
    let url: URL;
    try {
      url = new URL(req.path || '/', 'http://localhost');
    } catch {
      return send(404, 'Not found');
    }
    if (url.pathname !== '/' && url.pathname !== '/report.json') return send(404, 'Not found');
    const key = clientKey(req.address);
    const now = deps.now();
    if (limiter.blocked(key, now)) return send(429, 'Too many requests');
    const published = deps.current();
    const token = url.searchParams.get('t') ?? '';
    if (!published || now > published.expiresAt || !tokenEquals(token, published.token)) {
      limiter.fail(key, now);
      return send(404, 'Not found');
    }
    if (url.pathname === '/report.json') return send(200, published.json, 'application/json; charset=utf-8');
    const html = deps.html();
    return html ? send(200, html, 'text/html; charset=utf-8') : send(404, 'Not found');
  };
}
