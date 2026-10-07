import { describe, expect, it } from 'vitest';
import { configRules } from '../src/rules/config';
import { UNSET } from '../src/snapshot';
import { ctx, rulesById, snap } from './helpers';

const rule = rulesById(configRules);
const run = (id: string, p: Parameters<typeof snap>[0]) => rule(id).run(snap(p), ctx());

describe('config rules', () => {
  it('CFG001 sv_scriptHookAllowed', () => {
    expect(run('CFG001', { convars: { sv_scriptHookAllowed: '1' } })).toMatchObject([{ severity: 'critical' }]);
    expect(run('CFG001', { convars: { sv_scriptHookAllowed: 'true' } })).toHaveLength(1);
    expect(run('CFG001', { convars: { sv_scriptHookAllowed: '0' } })).toEqual([]);
  });
  it('CFG002 onesync', () => {
    expect(run('CFG002', { convars: { onesync: 'off' } })).toMatchObject([{ severity: 'critical' }]);
    expect(run('CFG002', { convars: {} })).toHaveLength(1);
    expect(run('CFG002', { convars: { onesync: 'on' } })).toEqual([]);
  });
  it('CFG003 database user', () => {
    expect(run('CFG003', { db: { user: 'root', passwordEmpty: false } })).toMatchObject([{ severity: 'critical' }]);
    expect(run('CFG003', { db: { user: 'fivem', passwordEmpty: true } })).toHaveLength(1);
    expect(run('CFG003', { db: { user: 'fivem', passwordEmpty: false } })).toEqual([]);
    expect(run('CFG003', { db: { user: null, passwordEmpty: null } })).toEqual([]);
  });
  it('CFG004 game build', () => {
    expect(run('CFG004', { convars: {} })).toMatchObject([{ severity: 'warning' }]);
    expect(run('CFG004', { convars: { sv_enforceGameBuild: '3258' } })).toEqual([]);
  });
  it('CFG005 rcon', () => {
    expect(run('CFG005', { convars: { rcon_password: 'x' } })).toMatchObject([{ severity: 'warning' }]);
    expect(run('CFG005', { convars: { rcon_password: '' } })).toEqual([]);
  });
  it('CFG006 server build', () => {
    expect(run('CFG006', { serverBuild: 30000, recommendedBuild: 35245 })).toMatchObject([{ severity: 'warning' }]);
    expect(run('CFG006', { serverBuild: 35245, recommendedBuild: 35245 })).toEqual([]);
    expect(run('CFG006', { serverBuild: 35245, recommendedBuild: null })).toMatchObject([{ severity: 'info' }]);
  });
  it('CFG007 minor notes', () => {
    const f = run('CFG007', { convars: { sv_master1: UNSET, steam_webApiKey: 'none', sv_hostname: 'dev built with Qbox Project by The Community!' } });
    expect(f).toHaveLength(1);
    expect(f[0].details).toHaveLength(3);
    expect(run('CFG007', { convars: { sv_master1: '', steam_webApiKey: 'ABCDEF', sv_hostname: 'My City RP' } })).toEqual([]);
  });
});
