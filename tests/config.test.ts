import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseConfig } from '../src/config';

describe('parseConfig', () => {
  it('returns defaults for an empty object', () => {
    expect(parseConfig('{}')).toEqual({ config: DEFAULT_CONFIG, error: null, warnings: [] });
  });

  it('merges nested groups with defaults', () => {
    const { config } = parseConfig('{"groups":{"lua":false}}');
    expect(config.groups).toEqual({ manifest: true, items: true, config: true, lua: false });
  });

  it('reports the line of a JSON syntax error and falls back to defaults with the web report off', () => {
    const { config, error } = parseConfig('{\n  "command": "x",\n}');
    expect(config).toEqual({ ...DEFAULT_CONFIG, web: { ...DEFAULT_CONFIG.web, enabled: false } });
    expect(error).toMatch(/line 3/);
  });

  it('replaces wrong-typed values with defaults', () => {
    const { config, error } = parseConfig('{"command":42,"reports":{"keep":"10"},"web":{"tokenTtlMinutes":-5,"enabled":"yes"},"ignore":"x","updateCheck":"no"}');
    expect(error).toBeNull();
    expect(config.command).toBe('audit');
    expect(config.reports.keep).toBe(10);
    expect(config.web.tokenTtlMinutes).toBe(60);
    expect(config.web.enabled).toBe(true);
    expect(config.ignore).toEqual([]);
    expect(config.updateCheck).toBe(true);
  });

  it('keeps only valid extraFunctions and ignore entries', () => {
    const { config } = parseConfig(JSON.stringify({
      items: { extraFunctions: [{ name: 'GiveItem', argument: 2 }, { name: 5 }, { argument: 1 }, { name: 'X', argument: 0 }] },
      lua: { sensitiveFunctions: ['GiveCash', 7] },
      ignore: [{ rule: 'LUA001' }, { resource: 'qbx_*', path: '[standalone]/**' }, 'bad', {}],
    }));
    expect(config.items.extraFunctions).toEqual([{ name: 'GiveItem', argument: 2 }]);
    expect(config.lua.sensitiveFunctions).toEqual(['GiveCash']);
    expect(config.ignore).toEqual([{ rule: 'LUA001' }, { resource: 'qbx_*', path: '[standalone]/**' }]);
  });
});
