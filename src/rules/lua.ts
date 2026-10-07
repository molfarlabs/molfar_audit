import { callArgs, calleeName, isCall, lineOf, stringValue, walk, type LuaNode } from '../lua/walk';
import type { LuaFile } from '../snapshot';
import { perFileRule, type Finding, type Rule } from './types';

const SENSITIVE = ['AddMoney', 'AddItem', 'SetJob', 'addMoney', 'addInventoryItem', 'setJob'];
const LOOP_TYPES = new Set(['WhileStatement', 'RepeatStatement', 'ForNumericStatement', 'ForGenericStatement']);
// Natives that only work when called every frame: a Wait(0) loop around them is required.
const PER_FRAME = new Set(['DisableControlAction', 'DisableAllControlActions', 'EnableControlAction', 'DisablePlayerFiring']);
const isPerFrameNative = (name: string | null) => !!name && (name.endsWith('ThisFrame') || PER_FRAME.has(name));

function identifiersIn(n: LuaNode): string[] {
  const names: string[] = [];
  walk(n, (x) => {
    if (x.type === 'Identifier') names.push(x.name);
  });
  return names;
}

function checkHandler(fn: LuaNode, file: LuaFile, sensitive: Set<string>, out: Finding[]): void {
  const tainted = new Set<string>(fn.parameters.filter((p: LuaNode) => p.type === 'Identifier').map((p: LuaNode) => p.name));
  if (!tainted.size) return;
  let grew = true;
  while (grew) {
    grew = false;
    walk(fn, (n) => {
      if (n.type !== 'LocalStatement') return;
      n.variables.forEach((v: LuaNode, i: number) => {
        const init = n.init?.[i];
        if (init?.type === 'Identifier' && tainted.has(init.name) && !tainted.has(v.name)) {
          tainted.add(v.name);
          grew = true;
        }
      });
    });
  }
  const guards: { name: string; line: number }[] = [];
  walk(fn, (n) => {
    if ((n.type === 'IfClause' || n.type === 'ElseifClause') && n.condition) {
      for (const name of identifiersIn(n.condition)) if (tainted.has(name)) guards.push({ name, line: lineOf(n) });
    }
  });
  walk(fn, (n) => {
    if (!isCall(n)) return;
    const callee = calleeName(n);
    if (!callee || !sensitive.has(callee)) return;
    const line = lineOf(n);
    const bad = callArgs(n)
      .filter((a) => a?.type === 'Identifier' && tainted.has(a.name))
      .map((a) => a.name as string)
      .filter((name) => !guards.some((g) => g.name === name && g.line <= line));
    if (!bad.length) return;
    out.push({
      rule: 'LUA001', severity: 'possible', group: 'lua', resource: file.resource, file: file.rel, line,
      message: `Net event passes client value${bad.length > 1 ? 's' : ''} ${bad.map((b) => `"${b}"`).join(', ')} straight into ${callee}()`,
      why: 'Cheaters can trigger server events with any arguments; without checks they can give themselves money, items or jobs.',
      fix: 'Validate the values on the server (type, range, player distance/permissions) before using them, or compute them server-side.',
    });
  });
}

const LUA001 = perFileRule('LUA001', 'lua', (file, _s, ctx) => {
  if (!file.ast || file.side !== 'server') return [];
  const sensitive = new Set([...SENSITIVE, ...ctx.config.lua.sensitiveFunctions]);
  const out: Finding[] = [];
  const netEvents = new Set<string>();
  walk(file.ast, (n) => {
    if (isCall(n) && n.base?.type === 'Identifier' && n.base.name === 'RegisterNetEvent') {
      const name = stringValue(callArgs(n)[0]);
      if (name) netEvents.add(name);
    }
  });
  walk(file.ast, (n) => {
    if (!isCall(n) || n.base?.type !== 'Identifier') return;
    const args = callArgs(n);
    const fn = args[1];
    if (fn?.type !== 'FunctionDeclaration') return;
    const event = stringValue(args[0]);
    if (n.base.name === 'RegisterNetEvent' || (n.base.name === 'AddEventHandler' && event && netEvents.has(event))) {
      checkHandler(fn, file, sensitive, out);
    }
  });
  return out;
});

function isZeroWait(n: LuaNode): boolean {
  const arg = callArgs(n)[0];
  return arg?.type === 'NumericLiteral' && arg.value === 0;
}

const LUA002 = perFileRule('LUA002', 'lua', (file) => {
  if (!file.ast || file.side !== 'client') return [];
  const out: Finding[] = [];
  walk(file.ast, (loop) => {
    if (loop.type !== 'WhileStatement' || loop.condition?.type !== 'BooleanLiteral' || loop.condition.value !== true) return;
    const waits: LuaNode[] = [];
    let exits = false;
    walk(loop, (n) => {
      if (n === loop) return;
      if (n.type === 'FunctionDeclaration' || LOOP_TYPES.has(n.type)) return false;
      if (n.type === 'BreakStatement' || n.type === 'ReturnStatement' || n.type === 'GotoStatement') exits = true;
      if (isCall(n) && calleeName(n) === 'Wait') waits.push(n);
    });
    if (exits || !waits.length || !waits.every(isZeroWait)) return;
    let perFrame = false;
    walk(loop, (n) => {
      if (n.type === 'FunctionDeclaration') return false;
      if (isCall(n) && isPerFrameNative(calleeName(n))) perFrame = true;
    });
    if (perFrame) return;
    out.push({
      rule: 'LUA002', severity: 'possible', group: 'lua', resource: file.resource, file: file.rel, line: lineOf(loop),
      message: 'Endless loop runs every frame (only Wait(0))',
      why: 'A loop that never sleeps costs CPU time on every frame for every player, lowering FPS.',
      fix: 'Sleep longer when nothing needs drawing (for example Wait(1000) when the player is far away) and use Wait(0) only when needed.',
    });
  });
  return out;
});

const LUA003 = perFileRule('LUA003', 'lua', (file) => {
  if (!file.ast) return [];
  const out: Finding[] = [];
  const add = (n: LuaNode, message: string, fix: string) =>
    out.push({ rule: 'LUA003', severity: 'warning', group: 'lua', resource: file.resource, file: file.rel, line: lineOf(n), message,
      why: 'Deprecated APIs keep working for now but are slower, unsupported, or will be removed.', fix });
  walk(file.ast, (n) => {
    if (n.type === 'ForGenericStatement') {
      let found = false;
      for (const it of n.iterators) walk(it, (x) => { if (isCall(x) && calleeName(x) === 'GetPlayerIdentifiers') found = true; });
      if (found) add(n, 'Looping over GetPlayerIdentifiers() to find one identifier', "Use GetPlayerIdentifierByType(src, 'license') instead.");
      return;
    }
    if (!isCall(n) || n.base?.type !== 'Identifier') return;
    const first = stringValue(callArgs(n)[0]);
    if (n.base.name === 'RegisterServerEvent') add(n, 'RegisterServerEvent is deprecated', 'Use RegisterNetEvent instead.');
    if (n.base.name === 'TriggerEvent' && first === 'esx:getSharedObject') add(n, "Old 'esx:getSharedObject' event", 'Use local ESX = exports.es_extended:getSharedObject().');
    if (n.base.name === 'TriggerEvent' && first === 'QBCore:GetObject') add(n, "Old 'QBCore:GetObject' event", "Use local QBCore = exports['qb-core']:GetCoreObject().");
  });
  return out;
});

const LUA004: Rule = {
  id: 'LUA004',
  group: 'lua',
  run(s) {
    const broken = [...s.lua.values()].filter((f) => f.error !== null);
    const total = broken.length + s.skippedLarge.length;
    if (!total) return [];
    return [{
      rule: 'LUA004', severity: 'info', group: 'lua',
      message: `${total} Lua files could not be analysed`,
      why: 'The parser could not read them (a real syntax error or Lua syntax the auditor does not support yet), or they are large data files skipped to keep the server smooth.',
      fix: 'Check the listed files; if the server loads them fine, report it at https://github.com/molfarlabs/molfar_audit/issues.',
      details: [
        ...broken.slice(0, 100).map((f) => `${f.resource}/${f.rel}: ${f.error}`),
        ...s.skippedLarge.slice(0, 100).map((id) => `${id}: skipped (larger than 256 KB, usually a data table)`),
      ],
    }];
  },
};

export const luaRules: Rule[] = [LUA001, LUA002, LUA003, LUA004];
