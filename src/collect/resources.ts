import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createYielder } from '../util/yield';
import type { ResourceFile, ResourceInfo } from '../snapshot';
import type { Natives } from './natives';

const META_KEYS = ['fx_version', 'game', 'lua54', 'dependency', 'provide', 'client_script', 'server_script', 'shared_script', 'file', 'ui_page'];
const SKIP_DIRS = new Set(['node_modules', '.git']);

export function categoryOf(path: string, name: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  const idx = parts.lastIndexOf(name);
  const end = idx === -1 ? parts.length - 1 : idx;
  const cats: string[] = [];
  for (let i = end - 1; i >= 0 && /^\[.+\]$/.test(parts[i]); i--) cats.unshift(parts[i]);
  return cats.join('/');
}

// Sync fs on purpose: in FXServer every async completion waits for a server tick.
function isEscrowed(path: string): boolean {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(4);
    readSync(fd, buf, 0, 4, 0);
    return buf.toString('latin1') === 'FXAP';
  } finally {
    closeSync(fd);
  }
}

async function listFiles(root: string, onError: () => void, tick: () => Promise<void>): Promise<ResourceFile[]> {
  const out: ResourceFile[] = [];
  const stack = [''];
  while (stack.length) {
    await tick();
    const rel = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      onError();
      continue;
    }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(r);
        continue;
      }
      if (!e.isFile()) continue;
      try {
        const full = join(root, r);
        const { size } = statSync(full);
        out.push({ rel: r, size, escrowed: r.endsWith('.lua') ? isEscrowed(full) : false });
      } catch {
        onError();
      }
    }
  }
  return out;
}

export async function collectResources(nat: Natives): Promise<{ resources: ResourceInfo[]; unreadable: number }> {
  let unreadable = 0;
  const resources: ResourceInfo[] = [];
  const tick = createYielder();
  for (const name of nat.resourceNames()) {
    const path = nat.path(name) ?? '';
    const manifest: Record<string, string[]> = {};
    for (const key of META_KEYS) {
      const values = nat.metadata(name, key);
      if (values.length) manifest[key] = values;
    }
    const files = path ? await listFiles(path, () => unreadable++, tick) : [];
    resources.push({ name, state: nat.state(name), path, category: categoryOf(path, name), manifest, files });
    await tick();
  }
  return { resources, unreadable };
}
