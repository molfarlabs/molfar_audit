import { describe, expect, it } from 'vitest';
import { luaRules } from '../src/rules/lua';
import { ctx, lua, rulesById, snap, withLua } from './helpers';

const rule = rulesById(luaRules);
const run = (id: string, files: ReturnType<typeof lua>[], config = {}) => rule(id).run(snap({ lua: withLua(files) }), ctx(config));
const server = (src: string) => lua('shop', 'server.lua', 'server', src);
const client = (src: string) => lua('shop', 'client.lua', 'client', src);

describe('LUA001 client input into sensitive calls', () => {
  it('flags unchecked parameters passed to money and item functions', () => {
    const f = run('LUA001', [server(`RegisterNetEvent('shop:buy', function(amount, item)
  local Player = exports.qbx_core:GetPlayer(source)
  Player.Functions.AddMoney('cash', amount)
  exports.ox_inventory:AddItem(source, item, 1)
end)`)]);
    expect(f.map((x) => [x.line, x.severity])).toEqual([[3, 'possible'], [4, 'possible']]);
  });
  it('is quiet when the parameter is checked first', () => {
    expect(run('LUA001', [server(`RegisterNetEvent('shop:sell', function(amount)
  if type(amount) ~= 'number' or amount > 100 then return end
  exports.qbx_core:GetPlayer(source).Functions.AddMoney('cash', amount)
end)`)])).toEqual([]);
  });
  it('follows simple local aliases', () => {
    expect(run('LUA001', [server(`RegisterNetEvent('e', function(amount)
  local a = amount
  xPlayer.addMoney(a)
end)`)])).toHaveLength(1);
  });
  it('handles AddEventHandler for registered net events only', () => {
    expect(run('LUA001', [server(`RegisterNetEvent('net')
AddEventHandler('net', function(n) xPlayer.addMoney(n) end)
AddEventHandler('local', function(n) xPlayer.addMoney(n) end)`)])).toHaveLength(1);
  });
  it('ignores client files and constant arguments, and honours sensitiveFunctions', () => {
    expect(run('LUA001', [client(`RegisterNetEvent('e', function(n) xPlayer.addMoney(n) end)`)])).toEqual([]);
    expect(run('LUA001', [server(`RegisterNetEvent('e', function(n) xPlayer.addMoney(100) end)`)])).toEqual([]);
    expect(run('LUA001', [server(`RegisterNetEvent('e', function(n) GiveCash(n) end)`)], { lua: { sensitiveFunctions: ['GiveCash'] } })).toHaveLength(1);
  });
});

describe('LUA002 busy client loops', () => {
  it('flags while true loops that only Wait(0)', () => {
    const f = run('LUA002', [client(`CreateThread(function()
  while true do
    DrawMarker(1, 0.0, 0.0, 0.0)
    Wait(0)
  end
end)`)]);
    expect(f).toMatchObject([{ line: 2, severity: 'possible' }]);
    expect(run('LUA002', [client('while true do Citizen.Wait(0) end')])).toHaveLength(1);
  });
  it('is quiet for loops that must run every frame (ThisFrame natives, control disabling)', () => {
    expect(run('LUA002', [client('while true do SetPedDensityMultiplierThisFrame(0.5) Wait(0) end')])).toEqual([]);
    expect(run('LUA002', [client('while true do for i = 1, 3 do DisableControlAction(2, i, true) end Wait(0) end')])).toEqual([]);
  });
  it('is quiet for adaptive sleep, break, no wait, or server files', () => {
    expect(run('LUA002', [client('while true do local s = 1000 if near then s = 0 end Wait(s) end')])).toEqual([]);
    expect(run('LUA002', [client('while true do Wait(0) if done then break end end')])).toEqual([]);
    expect(run('LUA002', [client('while true do foo() end')])).toEqual([]);
    expect(run('LUA002', [server('while true do Wait(0) end')])).toEqual([]);
  });
});

describe('LUA003 deprecated APIs', () => {
  it('flags old APIs', () => {
    const f = run('LUA003', [server(`RegisterServerEvent('x')
TriggerEvent('esx:getSharedObject', function(obj) ESX = obj end)
TriggerEvent('QBCore:GetObject', function(obj) QBCore = obj end)
for _, id in ipairs(GetPlayerIdentifiers(src)) do end
local l = GetPlayerIdentifierByType(src, 'license')`)]);
    expect(f.map((x) => x.line)).toEqual([1, 2, 3, 4]);
  });
});

describe('LUA004 unparsable files', () => {
  it('lists files that could not be parsed', () => {
    const f = run('LUA004', [lua('a', 'broken.lua', 'server', 'local = = 1'), server('local ok = 1')]);
    expect(f).toHaveLength(1);
    expect(f[0].details?.[0]).toMatch(/^a\/broken\.lua: /);
    expect(run('LUA004', [server('local ok = 1')])).toEqual([]);
  });
});
