import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLua } from '../lua/parse';
import { stringValue, walk, type LuaNode } from '../lua/walk';
import { resolveEntry, SCRIPT_KEYS } from '../manifest/resolve';
import { createYielder, idle } from '../util/yield';
import { UNSET, type ItemDef, type LuaFile, type ResourceInfo, type ServerSnapshot, type Side } from '../snapshot';
import { parseMysqlConnection } from '../util/secrets';
import type { Natives } from './natives';
import { collectResources } from './resources';

export const CONVARS = ['version', 'onesync', 'sv_scriptHookAllowed', 'mysql_connection_string', 'sv_enforceGameBuild', 'rcon_password', 'sv_master1', 'steam_webApiKey', 'sv_hostname', 'inventory:imagepath'];

// Parsing is one synchronous call; above this size it can block the server for >100 ms.
// Files this large are data tables (emotes, tattoos, vehicles), not logic.
export const MAX_LUA_BYTES = 256 * 1024;

const SIDE: Record<(typeof SCRIPT_KEYS)[number], Side> = { client_script: 'client', server_script: 'server', shared_script: 'shared' };

export function parseBuild(version: string): number | null {
  const m = /v\d+\.\d+\.\d+\.(\d+)/.exec(version);
  return m ? Number(m[1]) : null;
}

async function recommended(fetchJson: (url: string) => Promise<any>): Promise<number | null> {
  try {
    const platform = process.platform === 'win32' ? 'win32' : 'linux';
    const json = await fetchJson(`https://changelogs-live.fivem.net/api/changelog/versions/${platform}/server`);
    const n = parseInt(json?.recommended, 10);
    return Number.isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

const fieldValue = (table: LuaNode, key: string): LuaNode | undefined =>
  table.fields?.find((f: LuaNode) => f.type === 'TableKeyString' && f.key?.name === key)?.value;

// ox_inventory's server-side Items() has no `client` block, so image overrides are read from its data files.
function imageOverrides(ox: ResourceInfo | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of ox?.files ?? []) {
    if (!/^data\/(items|weapons)\.lua$/.test(f.rel)) continue;
    let src: string;
    try {
      src = readFileSync(join(ox!.path, f.rel), 'utf8');
    } catch {
      continue;
    }
    const { ast } = parseLua(src);
    if (!ast) continue;
    try {
      walk(ast, (n) => {
      if ((n.type !== 'TableKey' && n.type !== 'TableKeyString') || n.value?.type !== 'TableConstructorExpression') return;
      const name = n.type === 'TableKey' ? stringValue(n.key) : n.key?.name;
      const client = fieldValue(n.value, 'client');
      const image = client?.type === 'TableConstructorExpression' ? stringValue(fieldValue(client, 'image')) : null;
      if (name && image) out.set(name, image);
      });
    } catch {
      // A data file we cannot walk only loses its image overrides.
    }
  }
  return out;
}

function collectItems(nat: Natives, resources: ResourceInfo[], overrides: Map<string, string>): Record<string, ItemDef> | null {
  if (resources.find((r) => r.name === 'ox_inventory')?.state !== 'started') return null;
  const raw = nat.oxItems();
  if (!raw || typeof raw !== 'object') return null;
  const items: Record<string, ItemDef> = {};
  for (const [name, def] of Object.entries(raw)) {
    const image = def?.client?.image ?? overrides.get(name);
    items[name] = image ? { label: String(def?.label ?? name), image: String(image) } : { label: String(def?.label ?? name) };
  }
  return items;
}

async function collectLua(resources: ResourceInfo[]): Promise<{ lua: Map<string, LuaFile>; unreadable: number; skippedLarge: string[] }> {
  const byName = new Map(resources.map((r) => [r.name, r]));
  const lua = new Map<string, LuaFile>();
  const skippedLarge: string[] = [];
  let unreadable = 0;
  const tick = createYielder();
  for (const r of resources) {
    if (r.state !== 'started' && r.state !== 'starting') continue;
    const escrowed = new Set(r.files.filter((f) => f.escrowed).map((f) => f.rel));
    const sizes = new Map(r.files.map((f) => [f.rel, f.size]));
    for (const key of SCRIPT_KEYS) {
      for (const raw of r.manifest[key] ?? []) {
        const entry = resolveEntry(key, raw, r, byName);
        if (entry.targetResource !== r.name) continue;
        for (const rel of entry.matches) {
          const id = `${r.name}/${rel}`;
          if (!rel.endsWith('.lua') || escrowed.has(rel) || lua.has(id) || skippedLarge.includes(id)) continue;
          if ((sizes.get(rel) ?? 0) > MAX_LUA_BYTES) {
            skippedLarge.push(id);
            continue;
          }
          let src: string;
          try {
            src = readFileSync(join(r.path, rel), 'utf8');
          } catch {
            unreadable++;
            continue;
          }
          const parsed = parseLua(src);
          lua.set(id, { resource: r.name, rel, side: SIDE[key], ast: parsed.ast, error: parsed.error, ignores: parsed.ignores, strings: parsed.strings });
          await tick();
        }
      }
    }
  }
  return { lua, unreadable, skippedLarge };
}

export async function buildSnapshot(nat: Natives, deps: { fetchJson: (url: string) => Promise<any>; now: Date }): Promise<ServerSnapshot> {
  const { resources, unreadable } = await collectResources(nat);
  const convars: Record<string, string> = {};
  for (const name of CONVARS) convars[name] = nat.convar(name, UNSET);
  const conn = convars.mysql_connection_string === UNSET ? { user: null, password: null } : parseMysqlConnection(convars.mysql_connection_string);
  const ox = resources.find((r) => r.name === 'ox_inventory');
  const itemImages = new Set((ox?.files ?? []).filter((f) => f.rel.startsWith('web/images/')).map((f) => f.rel.slice('web/images/'.length).toLowerCase()));
  const { lua, unreadable: unreadableLua, skippedLarge } = await collectLua(resources);
  return {
    takenAt: deps.now.toISOString(),
    serverBuild: parseBuild(convars.version === UNSET ? '' : convars.version),
    recommendedBuild: await idle(recommended(deps.fetchJson)),
    resources,
    convars,
    db: { user: conn.user, passwordEmpty: conn.password === null ? null : conn.password === '' },
    items: collectItems(nat, resources, imageOverrides(ox)),
    itemImages,
    lua,
    unreadableFiles: unreadable + unreadableLua,
    skippedLarge,
  };
}
