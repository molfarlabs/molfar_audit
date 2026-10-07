import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReport } from '../src/report/build';
import { formatConsole } from '../src/report/console';
import { runRules } from '../src/report/run';
import { saveReport } from '../src/report/store';
import { configRules } from '../src/rules/config';
import { GROUPS, perFileRule, type Finding, type Rule } from '../src/rules/types';
import { startLagMonitor } from '../src/util/lag';
import { DEFAULT_CONFIG } from '../src/config';
import { ctx, lua, res, snap, withLua } from './helpers';

const f = (p: Partial<Finding>): Finding => ({ rule: 'MAN003', severity: 'warning', group: 'manifest', message: 'm', why: 'w', fix: 'x', ...p });
const META = { version: '1.0.0', durationMs: 1234, maxBlockMs: 12, now: new Date('2026-10-07T10:00:00Z') };

describe('runRules', () => {
  it('turns a throwing rule into an info finding and keeps going', async () => {
    const boom: Rule = { id: 'BOOM01', group: 'lua', run: () => { throw new Error('kaput'); } };
    const ok: Rule = { id: 'OK0001', group: 'lua', run: () => [f({ rule: 'OK0001', group: 'lua' })] };
    const out = await runRules([boom, ok], snap(), ctx(), new Set(GROUPS));
    expect(out.map((x) => [x.rule, x.severity])).toEqual([['BOOM01', 'info'], ['OK0001', 'warning']]);
    expect(out[0].message).toContain('kaput');
  });
  it('runs per-file rules once per Lua file plus their one-off part', async () => {
    const seen: string[] = [];
    const r: Rule = perFileRule('PF0001', 'lua', (file) => { seen.push(file.rel); return [f({ rule: 'PF0001', group: 'lua', file: file.rel })]; }, () => [f({ rule: 'PF0001', group: 'lua', message: 'once' })]);
    const s = snap({ lua: withLua([lua('a', 'x.lua', 'server', ''), lua('a', 'y.lua', 'server', '')]) });
    const out = await runRules([r], s, ctx(), new Set(GROUPS));
    expect(seen).toEqual(['x.lua', 'y.lua']);
    expect(out.map((x) => x.file ?? x.message)).toEqual(['once', 'x.lua', 'y.lua']);
    expect(r.run(s, ctx()).length).toBe(3);
  });
  it('skips groups not requested or disabled in config', async () => {
    const r: Rule = { id: 'X00001', group: 'lua', run: () => [f({})] };
    expect(await runRules([r], snap(), ctx(), new Set(['manifest']))).toEqual([]);
    expect(await runRules([r], snap(), ctx({ groups: { ...DEFAULT_CONFIG.groups, lua: false } }), new Set(GROUPS))).toEqual([]);
  });
});

describe('buildReport', () => {
  it('sorts by severity then resource and counts', () => {
    const r = buildReport([f({ severity: 'info', resource: 'b' }), f({ severity: 'critical', resource: 'z' }), f({ severity: 'warning', resource: 'a' })], snap(), DEFAULT_CONFIG, META);
    expect(r.findings.map((x) => x.severity)).toEqual(['critical', 'warning', 'info']);
    expect(r.summary.bySeverity).toEqual({ critical: 1, warning: 1, possible: 0, info: 1 });
    expect(r.summary.maxBlockMs).toBe(12);
  });
  it('applies config ignores by rule, resource glob and category path', () => {
    const s = snap({ resources: [res({ name: 'qbx_core', category: '[qbx]' }), res({ name: 'tool', category: '[standalone]' }), res({ name: 'keep' })] });
    const config = { ...DEFAULT_CONFIG, ignore: [{ rule: 'LUA002' }, { resource: 'qbx_*' }, { path: '[standalone]/**' }] };
    const r = buildReport([f({ rule: 'LUA002', resource: 'keep' }), f({ resource: 'qbx_core' }), f({ resource: 'tool', file: 'a.lua' }), f({ resource: 'keep' })], s, config, META);
    expect(r.findings).toHaveLength(1);
    expect(r.summary.hidden).toBe(3);
  });
  it('applies inline ignore comments', () => {
    const file = lua('shop', 'server.lua', 'server', 'foo()\nbar() -- molfar-audit-ignore LUA001');
    const r = buildReport([f({ rule: 'LUA001', resource: 'shop', file: 'server.lua', line: 2 }), f({ rule: 'LUA001', resource: 'shop', file: 'server.lua', line: 1 })], snap({ lua: withLua([file]) }), DEFAULT_CONFIG, META);
    expect(r.findings.map((x) => x.line)).toEqual([1]);
  });
  it('never leaks convar secrets', async () => {
    const s = snap({
      convars: { sv_licenseKey: 'cfxk_SECRETKEY123', rcon_password: 'RCONSECRET', steam_webApiKey: 'STEAMSECRET', mysql_connection_string: 'mysql://root:DBSECRET@127.0.0.1/x', sv_hostname: 'x built with' },
      db: { user: 'root', passwordEmpty: false },
    });
    const findings = await runRules(configRules, s, ctx(), new Set(GROUPS));
    const json = JSON.stringify(buildReport(findings, s, DEFAULT_CONFIG, META));
    for (const secret of ['SECRETKEY123', 'RCONSECRET', 'STEAMSECRET', 'DBSECRET']) expect(json).not.toContain(secret);
  });
  it('produces forum markdown with escaped pipes', () => {
    const r = buildReport([f({ message: 'a | b', resource: 'x' })], snap(), DEFAULT_CONFIG, META);
    expect(r.markdown).toContain('| Level | Rule | Where | Problem |');
    expect(r.markdown).toContain('a \\| b');
  });
});

describe('formatConsole', () => {
  it('prints counts, top findings and the link', () => {
    const r = buildReport([f({ severity: 'critical', message: 'broken thing', resource: 'a' })], snap(), DEFAULT_CONFIG, META);
    const out = formatConsole(r, 'https://x/molfar_audit/?t=abc', 60, '2026-10-07_100000.json').join('\n');
    expect(out).toContain('1 critical');
    expect(out).toContain('broken thing');
    expect(out).toContain('https://x/molfar_audit/?t=abc');
    expect(out).toContain('60 min');
  });
});

describe('formatConsole grouping', () => {
  it('collapses identical findings in one file into one line with all line numbers', () => {
    const same = (line: number) => f({ rule: 'LUA003', resource: 'chat', file: 'sv_chat.lua', line, message: 'RegisterServerEvent is deprecated' });
    const r = buildReport([same(1), same(2), same(3), f({ resource: 'other', message: 'different' })], snap(), DEFAULT_CONFIG, META);
    const out = formatConsole(r, null, 60, 'x.json');
    expect(out.filter((l) => l.includes('RegisterServerEvent'))).toHaveLength(1);
    expect(out.join('\n')).toContain('chat/sv_chat.lua:1,2,3');
  });
});

describe('saveReport', () => {
  it('writes JSON files and keeps only the newest N', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mfa-'));
    const r = buildReport([], snap(), DEFAULT_CONFIG, META);
    const names = [];
    for (const d of ['2026-10-01T10:00:00Z', '2026-10-02T10:00:00Z', '2026-10-03T10:00:00Z']) names.push(await saveReport(dir, r, 2, new Date(d)));
    expect(names[2]).toMatch(/^2026-10-03_\d{6}\.json$/);
    expect((await readdir(dir)).sort()).toEqual(names.slice(1).sort());
  });
});

describe('startLagMonitor', () => {
  it('measures event loop blocking', async () => {
    const stop = startLagMonitor();
    await new Promise((r) => setTimeout(r, 30));
    const end = Date.now() + 80;
    while (Date.now() < end) { /* block */ }
    await new Promise((r) => setTimeout(r, 30));
    expect(stop()).toBeGreaterThanOrEqual(50);
  });
});
