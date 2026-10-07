import type { Group } from './rules/types';

export interface IgnoreEntry {
  rule?: string;
  resource?: string;
  path?: string;
}

export interface AuditConfig {
  command: string;
  groups: Record<Group, boolean>;
  ignore: IgnoreEntry[];
  items: { extraFunctions: { name: string; argument: number }[] };
  lua: { sensitiveFunctions: string[] };
  web: { enabled: boolean; tokenTtlMinutes: number; baseUrl: string };
  reports: { keep: number };
  updateCheck: boolean;
}

export const DEFAULT_CONFIG: AuditConfig = {
  command: 'audit',
  groups: { manifest: true, items: true, config: true, lua: true },
  ignore: [],
  items: { extraFunctions: [] },
  lua: { sensitiveFunctions: [] },
  web: { enabled: true, tokenTtlMinutes: 60, baseUrl: '' },
  reports: { keep: 10 },
  updateCheck: true,
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function parseConfig(text: string): { config: AuditConfig; error: string | null; warnings: string[] } {
  let raw: unknown;
  const body = text.replace(/^\uFEFF/, '');
  try {
    raw = JSON.parse(body);
  } catch (e) {
    const msg = (e as Error).message;
    const pos = /position (\d+)/.exec(msg);
    const line = pos ? body.slice(0, Number(pos[1])).split('\n').length : null;
    // Fail closed: if the owner's config cannot be read, do not expose the web report.
    return {
      config: { ...DEFAULT_CONFIG, web: { ...DEFAULT_CONFIG.web, enabled: false } },
      error: `config.json is not valid JSON${line ? ` (line ${line})` : ''}: ${msg} — using defaults with the web report disabled`,
      warnings: [],
    };
  }

  const warnings: string[] = [];
  const section = (v: unknown, path: string): Record<string, unknown> => {
    if (v === undefined) return {};
    if (isObj(v)) return v;
    warnings.push(`${path} must be an object — ignored`);
    return {};
  };
  const bool = (v: unknown, path: string, d: boolean) => {
    if (v === undefined || typeof v === 'boolean') return v ?? d;
    warnings.push(`${path} must be true or false — using ${d}`);
    return d;
  };
  const str = (v: unknown, path: string, d: string) => {
    if (v === undefined) return d;
    if (typeof v === 'string' && (v.length > 0 || d === '')) return v;
    warnings.push(`${path} must be a non-empty string — using "${d}"`);
    return d;
  };
  const posInt = (v: unknown, path: string, d: number) => {
    if (v === undefined) return d;
    if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v;
    warnings.push(`${path} must be a positive whole number — using ${d}`);
    return d;
  };
  const list = (v: unknown, path: string): unknown[] => {
    if (v === undefined) return [];
    if (Array.isArray(v)) return v;
    warnings.push(`${path} must be a list — ignored`);
    return [];
  };
  const optStr = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);

  const r = section(raw, 'config.json');
  const groups = section(r.groups, 'groups');
  const items = section(r.items, 'items');
  const lua = section(r.lua, 'lua');
  const web = section(r.web, 'web');
  const reports = section(r.reports, 'reports');
  const d = DEFAULT_CONFIG;

  const ignore: IgnoreEntry[] = [];
  list(r.ignore, 'ignore').forEach((e, i) => {
    const entry = isObj(e) ? { rule: optStr(e.rule), resource: optStr(e.resource), path: optStr(e.path) } : null;
    if (!entry || !(entry.rule || entry.resource || entry.path)) {
      warnings.push(`ignore[${i}] needs at least one of rule, resource, path — ignored`);
      return;
    }
    ignore.push(Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined)));
  });

  const extraFunctions: { name: string; argument: number }[] = [];
  list(items.extraFunctions, 'items.extraFunctions').forEach((e, i) => {
    if (isObj(e) && typeof e.name === 'string' && e.name.length > 0 && typeof e.argument === 'number' && Number.isInteger(e.argument) && e.argument > 0) {
      extraFunctions.push({ name: e.name, argument: e.argument });
    } else {
      warnings.push(`items.extraFunctions[${i}] needs a name and a positive argument number — ignored`);
    }
  });

  const sensitiveFunctions: string[] = [];
  list(lua.sensitiveFunctions, 'lua.sensitiveFunctions').forEach((v, i) => {
    if (typeof v === 'string' && v.length > 0) sensitiveFunctions.push(v);
    else warnings.push(`lua.sensitiveFunctions[${i}] must be a function name — ignored`);
  });

  return {
    error: null,
    warnings,
    config: {
      command: str(r.command, 'command', d.command),
      groups: {
        manifest: bool(groups.manifest, 'groups.manifest', true),
        items: bool(groups.items, 'groups.items', true),
        config: bool(groups.config, 'groups.config', true),
        lua: bool(groups.lua, 'groups.lua', true),
      },
      ignore,
      items: { extraFunctions },
      lua: { sensitiveFunctions },
      web: {
        enabled: bool(web.enabled, 'web.enabled', d.web.enabled),
        tokenTtlMinutes: posInt(web.tokenTtlMinutes, 'web.tokenTtlMinutes', d.web.tokenTtlMinutes),
        baseUrl: str(web.baseUrl, 'web.baseUrl', d.web.baseUrl),
      },
      reports: { keep: posInt(reports.keep, 'reports.keep', d.reports.keep) },
      updateCheck: bool(r.updateCheck, 'updateCheck', d.updateCheck),
    },
  };
}
