import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSnapshot, parseBuild } from '../src/collect/index';
import type { Natives } from '../src/collect/natives';
import { categoryOf, collectResources } from '../src/collect/resources';

async function put(root: string, rel: string, content: string | Buffer) {
  await mkdir(join(root, rel, '..'), { recursive: true });
  await writeFile(join(root, rel), content);
}

async function fakeServer() {
  const root = await mkdtemp(join(tmpdir(), 'mfa-srv-'));
  const shop = join(root, 'resources', '[jobs]', 'shop');
  const ox = join(root, 'resources', '[ox]', 'ox_inventory');
  await put(shop, 'fxmanifest.lua', "fx_version 'cerulean'");
  await put(shop, 'client/main.lua', "exports.ox_inventory:Search('count', 'water')");
  await put(shop, 'server/main.lua', 'local = broken');
  await put(shop, 'server/locked.lua', Buffer.from('FXAP\u0000\u0001binary'));
  await put(shop, 'node_modules/x/index.js', 'x');
  await put(shop, 'client/huge.lua', 'local t = {' + ' 1,'.repeat(100_000) + ' }');
  await put(ox, 'web/images/water.png', 'png');
  await put(ox, 'web/images/Drum.PNG', 'png');
  await put(ox, 'data/weapons.lua', "return { Components = { ['at_clip_drum_rifle'] = { label = 'Drum', client = { image = 'at_clip_drum.png', component = { `X` } } } } }");
  const paths: Record<string, string> = { shop, ox_inventory: ox };
  const meta: Record<string, Record<string, string[]>> = {
    shop: { fx_version: ['cerulean'], client_script: ['client/*.lua'], server_script: ['server/main.lua', 'server/locked.lua'] },
    ox_inventory: { fx_version: ['cerulean'] },
  };
  const convars: Record<string, string> = { version: 'FXServer-master v1.0.0.30000 linux', mysql_connection_string: 'mysql://fivem:pw@127.0.0.1/qbox', onesync: 'on' };
  const nat: Natives = {
    resourceNames: () => ['shop', 'ox_inventory'],
    state: () => 'started',
    path: (n) => paths[n],
    metadata: (n, k) => meta[n]?.[k] ?? [],
    convar: (n, d) => convars[n] ?? d,
    oxItems: () => ({ water: { label: 'Water' }, burger: { label: 'Burger', client: { image: 'nui://x/b.png' } }, at_clip_drum_rifle: { label: 'Drum' } }),
  };
  return { root, nat };
}

describe('categoryOf', () => {
  it('reads nested [category] folders', () => {
    expect(categoryOf('/srv/resources/[qbx]/[core]/qbx_core', 'qbx_core')).toBe('[qbx]/[core]');
    expect(categoryOf('/srv/resources/ox_lib', 'ox_lib')).toBe('');
    expect(categoryOf('C:\\srv\\resources\\[ox]\\ox_lib', 'ox_lib')).toBe('[ox]');
  });
});

describe('collectResources', () => {
  it('lists files, skips node_modules and marks escrow', async () => {
    const { nat } = await fakeServer();
    const { resources } = await collectResources(nat);
    const shop = resources.find((r) => r.name === 'shop')!;
    expect(shop.category).toBe('[jobs]');
    expect(shop.files.map((f) => f.rel).sort()).toEqual(['client/huge.lua', 'client/main.lua', 'fxmanifest.lua', 'server/locked.lua', 'server/main.lua']);
    expect(shop.files.find((f) => f.rel === 'server/locked.lua')?.escrowed).toBe(true);
  });
});

describe('parseBuild', () => {
  it('extracts the build number', () => {
    expect(parseBuild('FXServer-master v1.0.0.35245 linux')).toBe(35245);
    expect(parseBuild('FXServer-master SERVER v1.0.0.35245 win32')).toBe(35245);
    expect(parseBuild('')).toBeNull();
  });
});

describe('buildSnapshot', () => {
  it('assembles everything', async () => {
    const { nat } = await fakeServer();
    const s = await buildSnapshot(nat, { fetchJson: async () => ({ recommended: '35245' }), now: new Date('2026-10-07T00:00:00Z') });
    expect(s.serverBuild).toBe(30000);
    expect(s.recommendedBuild).toBe(35245);
    expect(s.db).toEqual({ user: 'fivem', passwordEmpty: false });
    expect(s.items).toEqual({ water: { label: 'Water' }, burger: { label: 'Burger', image: 'nui://x/b.png' }, at_clip_drum_rifle: { label: 'Drum', image: 'at_clip_drum.png' } });
    expect([...s.itemImages].sort()).toEqual(['drum.png', 'water.png']);
    expect([...s.lua.keys()].sort()).toEqual(['shop/client/main.lua', 'shop/server/main.lua']);
    expect(s.skippedLarge).toEqual(['shop/client/huge.lua']);
    expect(s.lua.get('shop/client/main.lua')?.side).toBe('client');
    expect(s.lua.get('shop/server/main.lua')?.error).toBeTruthy();
  });
  it('survives a failing version API', async () => {
    const { nat } = await fakeServer();
    const s = await buildSnapshot(nat, { fetchJson: async () => { throw new Error('offline'); }, now: new Date() });
    expect(s.recommendedBuild).toBeNull();
  });
});
