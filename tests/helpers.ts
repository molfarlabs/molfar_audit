import { DEFAULT_CONFIG, type AuditConfig } from '../src/config';
import { parseLua } from '../src/lua/parse';
import type { Rule, RuleContext } from '../src/rules/types';
import type { LuaFile, ResourceInfo, ServerSnapshot, Side } from '../src/snapshot';

export const BASE_MANIFEST = { fx_version: ['cerulean'], game: ['gta5'], lua54: ['yes'] };

export function res(p: Partial<ResourceInfo> & { name: string }): ResourceInfo {
  return { state: 'started', path: `/srv/resources/${p.name}`, category: '', manifest: { ...BASE_MANIFEST }, files: [], ...p };
}

export function lua(resource: string, rel: string, side: Side, src: string): LuaFile {
  const r = parseLua(src);
  return { resource, rel, side, ast: r.ast, error: r.error, ignores: r.ignores, strings: r.strings };
}

export function withLua(files: LuaFile[]): Map<string, LuaFile> {
  return new Map(files.map((f) => [`${f.resource}/${f.rel}`, f]));
}

export function snap(p: Partial<ServerSnapshot> = {}): ServerSnapshot {
  return {
    takenAt: '2026-10-07T00:00:00.000Z',
    serverBuild: 35245,
    recommendedBuild: 35245,
    resources: [],
    convars: {},
    db: { user: 'fivem', passwordEmpty: false },
    items: null,
    itemImages: new Set(),
    lua: new Map(),
    unreadableFiles: 0,
    ...p,
  };
}

export function ctx(config: Partial<AuditConfig> = {}): RuleContext {
  return { config: { ...DEFAULT_CONFIG, ...config } };
}

export function rulesById(rules: Rule[]) {
  return (id: string) => {
    const rule = rules.find((r) => r.id === id);
    if (!rule) throw new Error(`no rule ${id}`);
    return rule;
  };
}
