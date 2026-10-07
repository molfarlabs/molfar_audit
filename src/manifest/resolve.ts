import type { ResourceInfo } from '../snapshot';
import { globMatcher, isGlob } from '../util/glob';

export const SCRIPT_KEYS = ['client_script', 'server_script', 'shared_script'] as const;
export const FILE_KEYS = [...SCRIPT_KEYS, 'file', 'ui_page'] as const;

export interface ResolvedEntry {
  key: string;
  raw: string;
  kind: 'explicit' | 'glob' | 'url';
  targetResource: string;
  path: string;
  matches: string[];
  caseMismatch?: boolean;
}

export function resolveEntry(key: string, raw: string, owner: ResourceInfo, byName: Map<string, ResourceInfo>): ResolvedEntry {
  if (/^(https?:)?\/\//i.test(raw) || /^nui:\/\//i.test(raw)) {
    return { key, raw, kind: 'url', targetResource: owner.name, path: raw, matches: [] };
  }
  let target = owner.name;
  let path = raw.replace(/\\/g, '/').replace(/^\.\//, '');
  const at = /^@([^/]+)\/(.+)$/.exec(path);
  if (at) {
    target = at[1];
    path = at[2];
  }
  const files = byName.get(target)?.files.map((f) => f.rel) ?? [];
  if (isGlob(path)) {
    const match = globMatcher(path);
    return { key, raw, kind: 'glob', targetResource: target, path, matches: files.filter((f) => match(f)) };
  }
  if (files.includes(path)) return { key, raw, kind: 'explicit', targetResource: target, path, matches: [path] };
  // Windows hosts are case-insensitive, so the file loads there but breaks on Linux.
  const lower = path.toLowerCase();
  const other = files.find((f) => f.toLowerCase() === lower);
  return other
    ? { key, raw, kind: 'explicit', targetResource: target, path, matches: [other], caseMismatch: true }
    : { key, raw, kind: 'explicit', targetResource: target, path, matches: [] };
}

export function resolveManifest(r: ResourceInfo, byName: Map<string, ResourceInfo>): ResolvedEntry[] {
  const out: ResolvedEntry[] = [];
  for (const key of FILE_KEYS) for (const raw of r.manifest[key] ?? []) out.push(resolveEntry(key, raw, r, byName));
  return out;
}
