import { describe, expect, it } from 'vitest';
import { itemRefs, itemRules } from '../src/rules/items';
import { ctx, lua, rulesById, snap, withLua } from './helpers';

const rule = rulesById(itemRules);
const ITEMS = { water: { label: 'Water' }, bread: { label: 'Bread' } };

const SERVER = `local ox = exports.ox_inventory
RegisterCommand('t', function(src)
  exports.ox_inventory:AddItem(src, 'water', 1)
  exports['ox_inventory']:RemoveItem(src, 'ghost_item', 1)
  ox:Search(src, 'count', {'bread', 'phantom'})
  local Player = exports.qbx_core:GetPlayer(src)
  Player.Functions.AddItem('qb_ghost', 1)
  xPlayer.addInventoryItem('esx_ghost', 1)
  GiveItem(src, 'custom_ghost')
  local name = 'dynamic'
  exports.ox_inventory:AddItem(src, name, 1)
end)`;

const CLIENT = `local n = exports.ox_inventory:Search('count', 'client_ghost')
local c = exports.ox_inventory:GetItemCount('water')`;

describe('itemRefs', () => {
  it('extracts literal item names from known calls', () => {
    const refs = itemRefs(lua('shop', 'server.lua', 'server', SERVER), [{ name: 'GiveItem', argument: 2 }]);
    expect(refs.map((r) => r.name)).toEqual(['water', 'ghost_item', 'bread', 'phantom', 'qb_ghost', 'esx_ghost', 'custom_ghost']);
    expect(refs.find((r) => r.name === 'ghost_item')?.line).toBe(4);
  });
  it('uses client positions in client files', () => {
    expect(itemRefs(lua('shop', 'client.lua', 'client', CLIENT), []).map((r) => r.name)).toEqual(['client_ghost', 'water']);
  });
});

describe('ITM001 unknown items', () => {
  it('flags names not defined in ox_inventory', () => {
    const s = snap({ items: ITEMS, lua: withLua([lua('shop', 'server.lua', 'server', SERVER), lua('shop', 'client.lua', 'client', CLIENT)]) });
    const f = rule('ITM001').run(s, ctx({ items: { extraFunctions: [{ name: 'GiveItem', argument: 2 }] } }));
    expect(f.map((x) => x.message.match(/"([^"]+)"/)?.[1])).toEqual(['ghost_item', 'phantom', 'qb_ghost', 'esx_ghost', 'custom_ghost', 'client_ghost']);
    expect(f[0]).toMatchObject({ severity: 'warning', resource: 'shop', file: 'server.lua', line: 4 });
  });
  it('compares item names case-insensitively like ox_inventory does', () => {
    const s = snap({ items: { WEAPON_STUNGUN: { label: 'Taser' } }, lua: withLua([lua('bank', 'server.lua', 'server', "exports.ox_inventory:AddItem(src, 'weapon_stungun', 1)")]) });
    expect(rule('ITM001').run(s, ctx())).toEqual([]);
  });
  it('skips the group with one info finding when ox_inventory is not running', () => {
    expect(rule('ITM001').run(snap({ items: null }), ctx())).toMatchObject([{ severity: 'info' }]);
    expect(rule('ITM002').run(snap({ items: null }), ctx())).toEqual([]);
    expect(rule('ITM003').run(snap({ items: null }), ctx())).toEqual([]);
  });
});

describe('ITM002 missing images', () => {
  it('reports one finding listing items with no image file and no client.image', () => {
    const s = snap({ items: { water: { label: 'W' }, bread: { label: 'B', image: 'https://x.test/b.png' }, cake: { label: 'C' }, tea: { label: 'T' }, apple: { label: 'A' } }, itemImages: new Set(['water.png', 'tea.webp']) });
    const f = rule('ITM002').run(s, ctx());
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', message: '2 items have no image', details: ['apple', 'cake'] });
  });
  it('skips the check when images are served from an external imagepath', () => {
    const s = snap({ items: { cake: { label: 'C' } }, convars: { 'inventory:imagepath': 'https://cdn.example.com/items' } });
    expect(rule('ITM002').run(s, ctx())).toMatchObject([{ severity: 'info' }]);
    const local = snap({ items: { cake: { label: 'C' } }, convars: { 'inventory:imagepath': 'nui://ox_inventory/web/images' } });
    expect(rule('ITM002').run(local, ctx())).toMatchObject([{ severity: 'warning' }]);
  });
  it('matches image files case-insensitively (the game client runs on Windows)', () => {
    const s = snap({ items: { WEAPON_KNIFE: { label: 'K' }, firework: { label: 'F' } }, itemImages: new Set(['weapon_knife.png', 'firework.png']) });
    expect(rule('ITM002').run(s, ctx())).toEqual([]);
  });
});

describe('ITM003 unused items', () => {
  it('matches mentions case-insensitively', () => {
    const s = snap({ items: { WEAPON_STUNGUN: { label: 'T' } }, lua: withLua([lua('bank', 'server.lua', 'server', "local w = 'weapon_stungun'")]) });
    expect(rule('ITM003').run(s, ctx())).toEqual([]);
  });
  it('lists items never referenced outside ox_inventory', () => {
    const s = snap({
      items: { water: { label: 'W' }, bread: { label: 'B' }, unused: { label: 'U' } },
      lua: withLua([lua('shop', 'server.lua', 'server', 'local a = "water"\nlocal b = { "bread" }'), lua('ox_inventory', 'data/items.lua', 'shared', "return { unused = 1, x = 'unused' }")]),
    });
    const f = rule('ITM003').run(s, ctx());
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'info', details: ['unused'] });
  });
});
