import { callArgs, calleeName, isCall, lineOf, stringValue, walk, type LuaNode } from '../lua/walk';
import { UNSET, type LuaFile } from '../snapshot';
import { perFileRule, type Finding, type Rule } from './types';

const OX_SERVER: Record<string, number> = { AddItem: 2, RemoveItem: 2, CanCarryItem: 2, GetItem: 2, GetItemCount: 2, GetSlotWithItem: 2, GetSlotIdWithItem: 2, Search: 3 };
const OX_CLIENT: Record<string, number> = { Search: 2, GetItemCount: 1 };
const QB = new Set(['AddItem', 'RemoveItem', 'GetItemByName']);
const ESX = new Set(['addInventoryItem', 'removeInventoryItem', 'getInventoryItem']);
const OX = 'ox_inventory';

function isOxExports(n: LuaNode | undefined, aliases: Set<string>): boolean {
  if (!n) return false;
  if (n.type === 'MemberExpression' && n.base?.type === 'Identifier' && n.base.name === 'exports' && n.identifier?.name === OX) return true;
  if (n.type === 'IndexExpression' && n.base?.type === 'Identifier' && n.base.name === 'exports' && stringValue(n.index) === OX) return true;
  return n.type === 'Identifier' && aliases.has(n.name);
}

function oxAliases(ast: LuaNode): Set<string> {
  const aliases = new Set<string>();
  walk(ast, (n) => {
    if (n.type !== 'LocalStatement' && n.type !== 'AssignmentStatement') return;
    n.variables.forEach((v: LuaNode, i: number) => {
      if (v.type === 'Identifier' && isOxExports(n.init?.[i], new Set())) aliases.add(v.name);
    });
  });
  return aliases;
}

function literalStrings(n: LuaNode | undefined): string[] {
  const single = stringValue(n);
  if (single !== null) return [single];
  if (n?.type === 'TableConstructorExpression') {
    return n.fields
      .filter((f: LuaNode) => f.type === 'TableValue')
      .map((f: LuaNode) => stringValue(f.value))
      .filter((v: string | null): v is string => v !== null);
  }
  return [];
}

export function itemRefs(file: LuaFile, extra: { name: string; argument: number }[]): { name: string; line: number }[] {
  if (!file.ast) return [];
  const aliases = oxAliases(file.ast);
  const out: { name: string; line: number }[] = [];
  walk(file.ast, (n) => {
    if (!isCall(n)) return;
    const base = n.base as LuaNode;
    let pos: number | undefined;
    if (base.type === 'MemberExpression') {
      const fn = base.identifier.name as string;
      if (base.indexer === ':' && isOxExports(base.base, aliases)) pos = file.side === 'client' ? OX_CLIENT[fn] : OX_SERVER[fn];
      else if (QB.has(fn) && base.base?.type === 'MemberExpression' && base.base.identifier?.name === 'Functions') pos = 1;
      else if (ESX.has(fn)) pos = 1;
    }
    if (pos === undefined) pos = extra.find((e) => e.name === calleeName(n))?.argument;
    if (pos === undefined) return;
    for (const name of literalStrings(callArgs(n)[pos - 1])) out.push({ name, line: lineOf(n) });
  });
  return out;
}

const SKIPPED: Finding = {
  rule: 'ITM001', severity: 'info', group: 'items', resource: OX,
  message: 'ox_inventory is not started — item checks skipped',
  why: 'Item checks read the item list from ox_inventory.',
  fix: 'Start ox_inventory, or disable the "items" group in config.json if you use another inventory.',
};

// ox_inventory normalises item names (lower case, weapons upper case), so lookups ignore case.
const lowerNames = new WeakMap<object, Set<string>>();
function knownNames(items: Record<string, unknown>): Set<string> {
  let set = lowerNames.get(items);
  if (!set) {
    set = new Set(Object.keys(items).map((n) => n.toLowerCase()));
    lowerNames.set(items, set);
  }
  return set;
}

const DEFAULT_IMAGE_PATH = 'nui://ox_inventory/web/images';

const ITM001 = perFileRule(
  'ITM001',
  'items',
  (file, s, ctx) => {
    if (!s.items || file.resource === OX) return [];
    const known = knownNames(s.items);
    const out: Finding[] = [];
    const seen = new Set<string>();
    for (const ref of itemRefs(file, ctx.config.items.extraFunctions)) {
      const key = `${ref.name}:${ref.line}`;
      if (known.has(ref.name.toLowerCase()) || seen.has(key)) continue;
      seen.add(key);
      out.push({
        rule: 'ITM001', severity: 'warning', group: 'items', resource: file.resource, file: file.rel, line: ref.line,
        message: `Item "${ref.name}" is not defined in ox_inventory`,
        why: 'Giving, taking or searching an unknown item silently fails, so the feature breaks for players.',
        fix: `Add "${ref.name}" to ox_inventory/data/items.lua or fix the item name in the code.`,
      });
    }
    return out;
  },
  (s) => (s.items ? [] : [SKIPPED]),
);

const ITM002: Rule = {
  id: 'ITM002',
  group: 'items',
  run(s) {
    if (!s.items) return [];
    const imagePath = s.convars['inventory:imagepath'];
    if (imagePath && imagePath !== UNSET && imagePath.replace(/\/+$/, '') !== DEFAULT_IMAGE_PATH) {
      return [{
        rule: 'ITM002', severity: 'info', group: 'items', resource: OX,
        message: 'Item images are served from a custom inventory:imagepath — image check skipped',
        why: 'Only images inside ox_inventory/web/images can be checked from the server.',
        fix: 'Nothing to do if your image host has every item.',
      }];
    }
    const missing = Object.entries(s.items)
      .filter(([name, def]) => !def.image && !s.itemImages.has(`${name.toLowerCase()}.png`) && !s.itemImages.has(`${name.toLowerCase()}.webp`))
      .map(([name]) => name)
      .sort();
    if (!missing.length) return [];
    return [{
      rule: 'ITM002', severity: 'warning', group: 'items', resource: OX, file: 'web/images',
      message: `${missing.length} items have no image`,
      why: 'Players see an empty icon for these items in the inventory.',
      fix: 'Add <item>.png for each listed item to ox_inventory/web/images, or set client.image in the item definition.',
      details: missing,
    }];
  },
};

const ITM003: Rule = {
  id: 'ITM003',
  group: 'items',
  run(s) {
    if (!s.items) return [];
    const mentioned = new Set<string>();
    for (const f of s.lua.values()) if (f.resource !== OX) for (const str of f.strings) mentioned.add(str.toLowerCase());
    const unused = Object.keys(s.items).filter((name) => !mentioned.has(name.toLowerCase())).sort();
    if (!unused.length) return [];
    return [{
      rule: 'ITM003', severity: 'info', group: 'items', resource: OX,
      message: `${unused.length} items are never mentioned in Lua code`,
      why: 'They may be leftovers — or used only by shops, crafting or JSON configs, which are not scanned.',
      fix: 'Remove items you no longer need from ox_inventory/data/items.lua.',
      details: unused.slice(0, 200),
    }];
  },
};

export const itemRules: Rule[] = [ITM001, ITM002, ITM003];
