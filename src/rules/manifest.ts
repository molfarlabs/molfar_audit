import { resolveManifest, SCRIPT_KEYS } from '../manifest/resolve';
import type { ResourceInfo, ServerSnapshot } from '../snapshot';
import type { Finding, Rule } from './types';

const STREAM_LIMIT = 16 * 1024 * 1024;

const isActive = (r: ResourceInfo) => r.state === 'started' || r.state === 'starting';

function providers(s: ServerSnapshot): Map<string, ResourceInfo[]> {
  const map = new Map<string, ResourceInfo[]>();
  const add = (name: string, r: ResourceInfo) => map.set(name, [...(map.get(name) ?? []), r]);
  for (const r of s.resources) {
    add(r.name, r);
    for (const p of r.manifest.provide ?? []) add(p, r);
  }
  return map;
}

const byName = (s: ServerSnapshot) => new Map(s.resources.map((r) => [r.name, r]));
const deps = (r: ResourceInfo) => (r.manifest.dependency ?? []).filter((d) => !d.startsWith('/'));

function finding(f: Omit<Finding, 'group'>): Finding {
  return { group: 'manifest', ...f };
}

// server.cfg is unreadable in the FXServer sandbox, so stopped resources are checked too:
// a stopped resource with a broken dependency simply cannot start (info: it may be unused on purpose).
const MAN001: Rule = {
  id: 'MAN001',
  group: 'manifest',
  run(s) {
    const out: Finding[] = [];
    const prov = providers(s);
    for (const r of s.resources) {
      const active = isActive(r);
      for (const d of deps(r)) {
        if (prov.has(d)) continue;
        out.push(finding({
          rule: 'MAN001', severity: active ? 'critical' : 'info', resource: r.name,
          message: active ? `Dependency "${d}" does not exist` : `Resource cannot start: dependency "${d}" does not exist`,
          why: 'FXServer refuses to start a resource whose dependency is missing.',
          fix: `Install "${d}" or remove it from the dependencies in fxmanifest.lua. Ignore this if you do not use the resource.`,
        }));
      }
    }
    return out;
  },
};

const MAN002: Rule = {
  id: 'MAN002',
  group: 'manifest',
  run(s) {
    const out: Finding[] = [];
    const prov = providers(s);
    for (const r of s.resources) {
      for (const d of deps(r)) {
        const list = prov.get(d);
        if (!list || list.some(isActive)) continue;
        out.push(finding({
          rule: 'MAN002', severity: isActive(r) ? 'warning' : 'info', resource: r.name,
          message: isActive(r) ? `Dependency "${d}" exists but is not started` : `Resource cannot start: dependency "${d}" is not started`,
          why: 'A dependency that failed to start also blocks every resource that needs it.',
          fix: `Check the console for errors from "${d}" and fix why it does not start.`,
        }));
      }
    }
    return out;
  },
};

function fileRule(id: 'MAN003' | 'MAN004'): Rule {
  return {
    id,
    group: 'manifest',
    run(s) {
      const out: Finding[] = [];
      const names = byName(s);
      for (const r of s.resources) {
        if (!isActive(r)) continue;
        for (const e of resolveManifest(r, names)) {
          if (id === 'MAN003' && e.caseMismatch) {
            out.push(finding({
              rule: id, severity: 'warning', resource: r.name, file: e.raw,
              message: `${e.key} "${e.raw}" differs only by letter case from "${e.matches[0]}"`,
              why: 'It works on Windows hosts but the file is not found on Linux hosts.',
              fix: `Use the exact file name "${e.matches[0]}" in fxmanifest.lua.`,
            }));
            continue;
          }
          if (e.matches.length > 0 || e.kind === 'url') continue;
          if (id === 'MAN003' && e.kind === 'explicit') {
            out.push(finding({
              rule: id, severity: 'critical', resource: r.name, file: e.raw,
              message: `${e.key} "${e.raw}" does not exist`,
              why: 'Files listed in fxmanifest.lua that are missing cause script errors or a broken UI.',
              fix: 'Restore the file or fix the path (paths are case-sensitive on Linux).',
            }));
          }
          if (id === 'MAN004' && e.kind === 'glob') {
            out.push(finding({
              rule: id, severity: 'warning', resource: r.name, file: e.raw,
              message: `${e.key} pattern "${e.raw}" matches no files`,
              why: 'A pattern that matches nothing usually means a renamed folder, so code you expect to run is not loaded.',
              fix: 'Fix the pattern or remove it from fxmanifest.lua.',
            }));
          }
        }
      }
      return out;
    },
  };
}

function fieldRule(id: string, test: (r: ResourceInfo) => string | null, why: string, fix: string): Rule {
  return {
    id,
    group: 'manifest',
    run(s) {
      const out: Finding[] = [];
      for (const r of s.resources) {
        const message = test(r);
        if (message) out.push(finding({ rule: id, severity: isActive(r) ? 'warning' : 'info', resource: r.name, file: 'fxmanifest.lua', message, why, fix }));
      }
      return out;
    },
  };
}

const MAN005 = fieldRule(
  'MAN005',
  (r) => {
    const fx = r.manifest.fx_version?.[0];
    if (!fx) return 'fx_version is missing (legacy __resource.lua?)';
    if (fx === 'adamant' || fx === 'bodacious') return `fx_version "${fx}" is outdated`;
    return null;
  },
  'Old manifest versions miss newer runtime features and may stop working in future server builds.',
  "Use fx_version 'cerulean' in fxmanifest.lua.",
);

const MAN006 = fieldRule(
  'MAN006',
  (r) => {
    const hasLua = SCRIPT_KEYS.some((k) => (r.manifest[k] ?? []).some((v) => v.toLowerCase().endsWith('.lua')));
    return hasLua && r.manifest.lua54?.[0] !== 'yes' ? "Lua resource without lua54 'yes'" : null;
  },
  'Without lua54 the resource runs on the old Lua 5.3 runtime, which is slower and cannot use escrow.',
  "Add lua54 'yes' to fxmanifest.lua.",
);

const MAN007 = fieldRule(
  'MAN007',
  (r) => (r.manifest.game?.length ? null : 'game is not specified'),
  'Without a game entry FXServer cannot tell whether the resource targets GTA V or RDR3.',
  "Add game 'gta5' (or 'common') to fxmanifest.lua.",
);

const MAN008: Rule = {
  id: 'MAN008',
  group: 'manifest',
  run(s) {
    const declared = new Map<string, string[]>();
    for (const r of s.resources) {
      if (!isActive(r)) continue;
      for (const p of r.manifest.provide ?? []) declared.set(p, [...(declared.get(p) ?? []), r.name]);
    }
    const out: Finding[] = [];
    for (const [name, list] of declared) {
      if (list.length < 2) continue;
      out.push(finding({
        rule: 'MAN008', severity: 'warning', resource: list[0],
        message: `${list.length} resources provide "${name}"`,
        why: 'Only one of them wins, so dependent resources may talk to the wrong implementation.',
        fix: 'Keep one provider and remove the others.',
        details: [...list].sort(),
      }));
    }
    return out;
  },
};

const MAN009: Rule = {
  id: 'MAN009',
  group: 'manifest',
  run(s) {
    const out: Finding[] = [];
    for (const r of s.resources) {
      if (!isActive(r)) continue;
      for (const f of r.files) {
        if (!/(^|\/)stream\//.test(f.rel) || f.size <= STREAM_LIMIT) continue;
        out.push(finding({
          rule: 'MAN009', severity: 'warning', resource: r.name, file: f.rel,
          message: `Streamed file is ${(f.size / 1024 / 1024).toFixed(1)} MiB`,
          why: 'Streamed assets over 16 MiB cause long loading, texture loss and client crashes.',
          fix: 'Optimise the asset (compress textures, reduce polygons) to get it under 16 MiB.',
        }));
      }
    }
    return out;
  },
};

export const manifestRules: Rule[] = [MAN001, MAN002, fileRule('MAN003'), fileRule('MAN004'), MAN005, MAN006, MAN007, MAN008, MAN009];
