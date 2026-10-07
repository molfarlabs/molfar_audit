import { describe, expect, it } from 'vitest';
import { createHttpHandler, newToken, RateLimiter, tokenEquals, type Published } from '../src/http';

function call(handler: ReturnType<typeof createHttpHandler>, path: string, method = 'GET', address = '1.2.3.4:5555') {
  const out = { code: 0, headers: {} as Record<string, string>, body: '' };
  handler({ method, path, address, headers: {} }, {
    writeHead(code, headers) { out.code = code; out.headers = headers ?? {}; },
    send(body) { out.body = body ?? ''; },
  });
  return out;
}

const TOKEN = 'a'.repeat(64);

function setup(now = 1000, published: Published | null = { token: TOKEN, expiresAt: 10_000, json: '{"ok":true}' }, html: string | null = '<html>report</html>') {
  const clock = { now };
  const handler = createHttpHandler({ current: () => published, html: () => html, now: () => clock.now, limiter: new RateLimiter(10, 600_000) });
  return { handler, clock };
}

describe('http handler', () => {
  it('serves JSON and HTML with the right token and security headers', () => {
    const { handler } = setup();
    const json = call(handler, `/report.json?t=${TOKEN}`);
    expect(json).toMatchObject({ code: 200, body: '{"ok":true}' });
    expect(json.headers).toMatchObject({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' });
    expect(json.headers['Content-Security-Policy']).toContain("default-src 'self'");
    expect(call(handler, `/?t=${TOKEN}`)).toMatchObject({ code: 200, body: '<html>report</html>' });
  });
  it('returns 404 for wrong, missing or expired tokens and unknown paths', () => {
    expect(call(setup().handler, '/report.json?t=bad').code).toBe(404);
    expect(call(setup().handler, '/report.json').code).toBe(404);
    expect(call(setup(20_000).handler, `/report.json?t=${TOKEN}`).code).toBe(404);
    expect(call(setup(1000, null).handler, `/report.json?t=${TOKEN}`).code).toBe(404);
    expect(call(setup().handler, `/etc/passwd?t=${TOKEN}`).code).toBe(404);
    expect(call(setup(1000, undefined, null).handler, `/?t=${TOKEN}`).code).toBe(404);
  });
  it('rejects non-GET', () => {
    expect(call(setup().handler, `/report.json?t=${TOKEN}`, 'POST').code).toBe(405);
  });
  it('rate-limits an address after 10 failures, even with the right token, until the window passes', () => {
    const { handler, clock } = setup();
    for (let i = 0; i < 10; i++) call(handler, '/report.json?t=bad');
    expect(call(handler, `/report.json?t=${TOKEN}`).code).toBe(429);
    expect(call(handler, `/report.json?t=${TOKEN}`, 'GET', '9.9.9.9:1').code).toBe(200);
    clock.now += 600_001;
    expect(call(handler, `/report.json?t=bad`).code).toBe(404);
  });
});

describe('tokens', () => {
  it('generates 64 hex chars and compares safely', () => {
    const t = newToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenEquals(t, t)).toBe(true);
    expect(tokenEquals(t, t.slice(1))).toBe(false);
    expect(tokenEquals(t, 'f'.repeat(64))).toBe(t === 'f'.repeat(64));
  });
});
