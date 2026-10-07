import { describe, expect, it } from 'vitest';
import { globMatcher } from '../src/util/glob';
import { resolveEntry } from '../src/manifest/resolve';
import { res } from './helpers';

const files = (...rels: string[]) => rels.map((rel) => ({ rel, size: 1, escrowed: false }));

describe('globMatcher', () => {
  it('treats [category] brackets literally', () => {
    expect(globMatcher('[standalone]/**')('[standalone]/x/y.lua')).toBe(true);
    expect(globMatcher('[standalone]/**')('s/x.lua')).toBe(false);
  });
  it('expands FiveM-style ** without slash recursively', () => {
    expect(globMatcher('client/**.lua')('client/a/b.lua')).toBe(true);
    expect(globMatcher('client/*.lua')('client/a/b.lua')).toBe(false);
  });
});

describe('resolveEntry', () => {
  const a = res({ name: 'a', files: files('client/main.lua', 'client/sub/x.lua', 'html/index.html') });
  const ox = res({ name: 'ox_lib', files: files('init.lua') });
  const byName = new Map([[a.name, a], [ox.name, ox]]);

  it('resolves explicit paths', () => {
    expect(resolveEntry('client_script', 'client/main.lua', a, byName)).toMatchObject({ kind: 'explicit', matches: ['client/main.lua'] });
    expect(resolveEntry('client_script', 'client/nope.lua', a, byName)).toMatchObject({ kind: 'explicit', matches: [] });
  });
  it('resolves globs', () => {
    expect(resolveEntry('client_script', 'client/**/*.lua', a, byName).matches.sort()).toEqual(['client/main.lua', 'client/sub/x.lua']);
  });
  it('resolves @resource paths against the other resource', () => {
    expect(resolveEntry('shared_script', '@ox_lib/init.lua', a, byName)).toMatchObject({ targetResource: 'ox_lib', matches: ['init.lua'] });
  });
  it('treats URLs as remote', () => {
    expect(resolveEntry('ui_page', 'https://example.com/ui', a, byName).kind).toBe('url');
  });
  it('normalises ./ and backslashes', () => {
    expect(resolveEntry('ui_page', '.\\html\\index.html', a, byName).matches).toEqual(['html/index.html']);
  });
});
