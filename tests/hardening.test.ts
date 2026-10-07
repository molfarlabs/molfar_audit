import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config';
import { createHttpHandler, RateLimiter } from '../src/http';
import { parseLua } from '../src/lua/parse';
import { preprocess } from '../src/lua/preprocess';
import { walk } from '../src/lua/walk';
import { resolveEntry } from '../src/manifest/resolve';
import { runRules } from '../src/report/run';
import { manifestRules } from '../src/rules/manifest';
import { GROUPS, perFileRule } from '../src/rules/types';
import { ctx, lua, res, rulesById, snap, withLua } from './helpers';

describe('preprocessor performance', () => {
  it('handles many compound assignments in linear time', () => {
    const many = Array.from({ length: 50_000 }, () => 'x += 1').join('\n');
    const oneLine = Array.from({ length: 6_000 }, () => 'v+=1').join(' ');
    const t = performance.now();
    preprocess(many);
    preprocess(oneLine);
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe('deep ASTs', () => {
  const deep = 'x = ' + Array.from({ length: 10_000 }, () => 'a').join(' + ');
  it('walks a 10k-term expression without overflowing the stack', () => {
    const r = parseLua(deep);
    expect(r.error).toBeNull();
    let n = 0;
    expect(() => walk(r.ast, () => { n++; })).not.toThrow();
    expect(n).toBeGreaterThan(10_000);
  });
  it('keeps the pre-order and parents of the recursive walk', () => {
    const order: string[] = [];
    walk(parseLua('f(1)').ast, (n, parents) => { order.push(`${parents.length}:${n.type}`); });
    expect(order).toEqual(['0:Chunk', '1:CallStatement', '2:CallExpression', '3:Identifier', '3:NumericLiteral']);
  });
  it('a rule that throws on one file still reports the other files', async () => {
    const r = perFileRule('PF0002', 'lua', (f) => {
      if (f.rel === 'bad.lua') throw new Error('boom');
      return [{ rule: 'PF0002', severity: 'warning', group: 'lua', file: f.rel, message: 'm', why: 'w', fix: 'x' }];
    });
    const s = snap({ lua: withLua([lua('a', 'bad.lua', 'server', ''), lua('a', 'good.lua', 'server', '')]) });
    const out = await runRules([r], s, ctx(), new Set(GROUPS));
    expect(out.map((f) => [f.severity, f.file])).toEqual([['info', 'bad.lua'], ['warning', 'good.lua']]);
  });
});

describe('config validation', () => {
  it('warns about wrong-typed keys instead of silently ignoring them', () => {
    const { config, warnings } = parseConfig('{"web":{"enabled":"false","tokenTtlMinutes":"5"},"groups":{"lua":"no"},"ignore":{"rule":"LUA001"}}');
    expect(config.web.enabled).toBe(true);
    expect(warnings.join('\n')).toMatch(/web\.enabled/);
    expect(warnings.join('\n')).toMatch(/web\.tokenTtlMinutes/);
    expect(warnings.join('\n')).toMatch(/groups\.lua/);
    expect(warnings.join('\n')).toMatch(/ignore/);
  });
  it('accepts a UTF-8 BOM', () => {
    const { config, error } = parseConfig('﻿{"command":"scan"}');
    expect(error).toBeNull();
    expect(config.command).toBe('scan');
  });
  it('fails closed on the web report when config.json is broken', () => {
    expect(parseConfig('{ nope').config.web.enabled).toBe(false);
  });
});

describe('parse errors do not leak source', () => {
  it('cuts the quoted source in parser messages', () => {
    const r = parseLua('local hook = "https://discord.com/api/webhooks/123456/SECRETSECRETSECRET\nprint(1)');
    expect(r.error).toBeTruthy();
    expect(r.error).not.toContain('SECRET');
  });
});

describe('http hardening', () => {
  it('answers 404 for unparsable paths instead of throwing', () => {
    const handler = createHttpHandler({ current: () => null, html: () => null, now: () => 0 });
    let code = 0;
    expect(() => handler({ method: 'GET', path: '//[', address: '1.1.1.1:1', headers: {} }, { writeHead(c) { code = c; }, send() {} })).not.toThrow();
    expect(code).toBe(404);
  });
  it('keeps the rate limiter bounded', () => {
    const limiter = new RateLimiter(10, 1_000, 100);
    for (let i = 0; i < 1_000; i++) limiter.fail(`10.0.${i >> 8}.${i & 255}`, 0);
    limiter.fail('9.9.9.9', 5_000);
    expect(limiter.size).toBeLessThanOrEqual(100);
  });
});

describe('case-only path differences', () => {
  it('resolves a path that differs only by case and reports a warning, not critical', () => {
    const files = [{ rel: 'client/main.lua', size: 1, escrowed: false }];
    const a = res({ name: 'a', files, manifest: { fx_version: ['cerulean'], game: ['gta5'], lua54: ['yes'], client_script: ['Client/Main.lua'] } });
    expect(resolveEntry('client_script', 'Client/Main.lua', a, new Map([['a', a]]))).toMatchObject({ matches: ['client/main.lua'], caseMismatch: true });
    const f = rulesById(manifestRules)('MAN003').run(snap({ resources: [a] }), ctx());
    expect(f).toMatchObject([{ severity: 'warning', file: 'Client/Main.lua' }]);
  });
});
