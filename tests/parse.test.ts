import { describe, expect, it } from 'vitest';
import { isIgnored, parseLua } from '../src/lua/parse';
import { calleeName, callArgs, isCall, stringValue, walk, type LuaNode } from '../src/lua/walk';

describe('parseLua', () => {
  it('parses plain Lua', () => {
    const r = parseLua('local a = 1\nprint(a)');
    expect(r.error).toBeNull();
    expect(r.ast).not.toBeNull();
  });

  it('parses CfxLua extensions', () => {
    const r = parseLua('local h = `adder`\nlocal t = {}\nt.n = 0\nt.n += 1\nlocal v = t?.n\nlocal c <const> = 1');
    expect(r.error).toBeNull();
  });

  it('parses real-world CfxLua lines and unicode strings', () => {
    expect(parseLua('if hide then hidden += 1 end').error).toBeNull();
    expect(parseLua('local t = {\n  a = 1,\n  /* old = 2, */\n}').error).toBeNull();
    const r = parseLua('local s = "Привіт 😀"\nlocal w = \'water\'');
    expect(r.error).toBeNull();
    expect([...r.strings]).toEqual(['Привіт 😀', 'water']);
  });

  it('returns an error instead of throwing', () => {
    const r = parseLua('local = = 1');
    expect(r.ast).toBeNull();
    expect(r.error).toBeTruthy();
  });

  it('collects ignore comments', () => {
    const r = parseLua('-- molfar-audit-ignore LUA001\nfoo()\nbar() -- molfar-audit-ignore\n');
    expect(isIgnored(r.ignores, 2, 'LUA001')).toBe(true);
    expect(isIgnored(r.ignores, 2, 'LUA002')).toBe(false);
    expect(isIgnored(r.ignores, 3, 'ANY001')).toBe(true);
    expect(isIgnored(r.ignores, 5, 'LUA001')).toBe(false);
  });

  it('exposes string literal values and call helpers', () => {
    const r = parseLua("exports.ox_inventory:AddItem(src, 'water', 1)\nprint 'hi'");
    const calls: LuaNode[] = [];
    walk(r.ast, (n) => {
      if (isCall(n)) calls.push(n);
    });
    expect(calleeName(calls[0])).toBe('AddItem');
    expect(stringValue(callArgs(calls[0])[1])).toBe('water');
    expect(stringValue(callArgs(calls[1])[0])).toBe('hi');
  });
});
