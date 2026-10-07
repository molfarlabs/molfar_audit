export type LuaNode = { type: string; loc?: { start: { line: number; column: number } }; [key: string]: any };

const SKIP_KEYS = new Set(['loc', 'range', 'comments', 'globals']);

function children(node: LuaNode): LuaNode[] {
  const out: LuaNode[] = [];
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child.type === 'string') out.push(child);
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      out.push(value);
    }
  }
  return out;
}

// Iterative pre-order walk: generated Lua can nest 10k+ levels deep (long `a + a + …` chains),
// which would overflow a recursive walk. Returning false from `visit` skips the node's children.
export function walk(root: LuaNode, visit: (node: LuaNode, parents: LuaNode[]) => void | false): void {
  const parents: LuaNode[] = [];
  const stack: { kids: LuaNode[]; i: number }[] = [];
  const enter = (node: LuaNode) => {
    if (visit(node, parents) === false) return;
    parents.push(node);
    stack.push({ kids: children(node), i: 0 });
  };
  enter(root);
  while (stack.length) {
    const top = stack[stack.length - 1];
    if (top.i < top.kids.length) {
      enter(top.kids[top.i++]);
    } else {
      stack.pop();
      parents.pop();
    }
  }
}

export const isCall = (n: LuaNode) =>
  n.type === 'CallExpression' || n.type === 'StringCallExpression' || n.type === 'TableCallExpression';

export function callArgs(call: LuaNode): LuaNode[] {
  if (call.type === 'CallExpression') return call.arguments ?? [];
  if (call.type === 'StringCallExpression') return [call.argument];
  if (call.type === 'TableCallExpression') return [call.arguments];
  return [];
}

export function calleeName(call: LuaNode): string | null {
  const base = call.base;
  if (!base) return null;
  if (base.type === 'Identifier') return base.name;
  if (base.type === 'MemberExpression') return base.identifier?.name ?? null;
  return null;
}

// luaparse runs with encodingMode 'none' (any unicode allowed), so values come from the raw source.
export function stringFromRaw(raw: string): string {
  const long = /^\[(=*)\[([\s\S]*)\]\1\]$/.exec(raw);
  if (long) return long[2].replace(/^\r?\n/, '');
  return raw.slice(1, -1);
}

export function stringValue(n: LuaNode | undefined): string | null {
  if (!n || n.type !== 'StringLiteral') return null;
  if (typeof n.value === 'string') return n.value;
  return typeof n.raw === 'string' ? stringFromRaw(n.raw) : null;
}

export const lineOf = (n: LuaNode) => n.loc?.start.line ?? 0;
