import { describe, expect, it } from 'vitest';
import { manifestRules } from '../src/rules/manifest';
import { BASE_MANIFEST, ctx, res, rulesById, snap } from './helpers';

const rule = rulesById(manifestRules);
const run = (id: string, s = snap()) => rule(id).run(s, ctx());
const files = (...rels: string[]) => rels.map((rel) => ({ rel, size: 1, escrowed: false }));

describe('MAN001 missing dependency', () => {
  it('flags a started resource whose dependency does not exist', () => {
    const f = run('MAN001', snap({ resources: [res({ name: 'a', manifest: { ...BASE_MANIFEST, dependency: ['missing_dep'] } })] }));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'critical', resource: 'a' });
    expect(f[0].message).toContain('missing_dep');
  });
  it('accepts dependencies satisfied by provide', () => {
    const s = snap({ resources: [res({ name: 'a', manifest: { ...BASE_MANIFEST, dependency: ['mysql-async'] } }), res({ name: 'oxmysql', manifest: { ...BASE_MANIFEST, provide: ['mysql-async'] } })] });
    expect(run('MAN001', s)).toEqual([]);
  });
  it('ignores built-in dependencies', () => {
    expect(run('MAN001', snap({ resources: [res({ name: 'a', manifest: { ...BASE_MANIFEST, dependency: ['/onesync', '/server:5104'] } })] }))).toEqual([]);
  });
  it('flags stopped resources as unable to start', () => {
    const f = run('MAN001', snap({ resources: [res({ name: 'a', state: 'stopped', manifest: { ...BASE_MANIFEST, dependency: ['x'] } })] }));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'info', resource: 'a' });
    expect(f[0].message).toMatch(/cannot start/);
  });
});

describe('MAN002 dependency not started', () => {
  it('warns when a dependency exists but is stopped', () => {
    const s = snap({ resources: [res({ name: 'a', manifest: { ...BASE_MANIFEST, dependency: ['b'] } }), res({ name: 'b', state: 'stopped' })] });
    expect(run('MAN002', s)).toMatchObject([{ severity: 'warning', resource: 'a' }]);
  });
  it('also covers stopped dependents, as info', () => {
    const s = snap({ resources: [res({ name: 'a', state: 'stopped', manifest: { ...BASE_MANIFEST, dependency: ['b'] } }), res({ name: 'b', state: 'stopped' })] });
    expect(run('MAN002', s)).toMatchObject([{ severity: 'info', resource: 'a' }]);
  });
  it('is quiet when the dependency is started', () => {
    const s = snap({ resources: [res({ name: 'a', manifest: { ...BASE_MANIFEST, dependency: ['b'] } }), res({ name: 'b' })] });
    expect(run('MAN002', s)).toEqual([]);
  });
});

describe('MAN003/MAN004 manifest files', () => {
  const a = res({ name: 'a', files: files('client/main.lua'), manifest: { ...BASE_MANIFEST, client_script: ['client/main.lua', 'client/missing.lua', 'nothing/*.lua'], ui_page: ['https://x.test/ui'] } });
  it('MAN003 flags missing explicit files', () => {
    expect(run('MAN003', snap({ resources: [a] }))).toMatchObject([{ severity: 'critical', resource: 'a', file: 'client/missing.lua' }]);
  });
  it('MAN004 flags globs with no matches', () => {
    expect(run('MAN004', snap({ resources: [a] }))).toMatchObject([{ severity: 'warning', resource: 'a', file: 'nothing/*.lua' }]);
  });
});

describe('MAN005–MAN007 manifest fields', () => {
  it('MAN005 flags old or missing fx_version, as info for stopped resources', () => {
    const s = snap({ resources: [res({ name: 'a', manifest: { fx_version: ['adamant'], game: ['gta5'] } }), res({ name: 'b', manifest: { game: ['gta5'] } }), res({ name: 'c', state: 'stopped', manifest: { fx_version: ['bodacious'], game: ['gta5'] } })] });
    expect(run('MAN005', s).map((f) => [f.resource, f.severity])).toEqual([['a', 'warning'], ['b', 'warning'], ['c', 'info']]);
  });
  it('MAN006 flags Lua resources without lua54', () => {
    const s = snap({ resources: [res({ name: 'a', manifest: { fx_version: ['cerulean'], game: ['gta5'], server_script: ['server.lua'] } }), res({ name: 'b', manifest: { fx_version: ['cerulean'], game: ['gta5'], server_script: ['server.js'] } })] });
    expect(run('MAN006', s)).toMatchObject([{ resource: 'a' }]);
  });
  it('MAN007 flags missing game', () => {
    expect(run('MAN007', snap({ resources: [res({ name: 'a', manifest: { fx_version: ['cerulean'] } })] }))).toMatchObject([{ resource: 'a', severity: 'warning' }]);
  });
});

describe('MAN008 duplicate provide', () => {
  it('reports one finding listing all providers', () => {
    const s = snap({ resources: [res({ name: 'a', manifest: { ...BASE_MANIFEST, provide: ['x'] } }), res({ name: 'b', manifest: { ...BASE_MANIFEST, provide: ['x'] } })] });
    const f = run('MAN008', s);
    expect(f).toHaveLength(1);
    expect(f[0].details).toEqual(['a', 'b']);
  });
});

describe('MAN009 oversized stream files', () => {
  it('flags stream files over 16 MiB', () => {
    const big = 17 * 1024 * 1024;
    const s = snap({ resources: [res({ name: 'cars', files: [{ rel: 'stream/big.ytd', size: big, escrowed: false }, { rel: 'stream/cars/x.yft', size: big, escrowed: false }, { rel: 'stream/ok.ytd', size: 15 * 1024 * 1024, escrowed: false }, { rel: 'data/big.bin', size: big, escrowed: false }] })] });
    expect(run('MAN009', s).map((f) => f.file)).toEqual(['stream/big.ytd', 'stream/cars/x.yft']);
  });
});
