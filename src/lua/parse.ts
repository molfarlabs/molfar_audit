import luaparse from 'luaparse';
import { preprocess } from './preprocess';
import { stringFromRaw } from './walk';

export type Ignores = Map<number, Set<string> | 'all'>;

const IGNORE = /molfar-audit-ignore\b([^\n]*)/;

export function parseLua(src: string): { ast: any | null; error: string | null; ignores: Ignores; strings: Set<string> } {
  const strings = new Set<string>();
  try {
    const ast = luaparse.parse(preprocess(src), {
      luaVersion: '5.3',
      locations: true,
      comments: true,
      scope: false,
      encodingMode: 'none',
      onCreateNode(node: { type: string; raw?: string }) {
        if (node.type === 'StringLiteral' && typeof node.raw === 'string') strings.add(stringFromRaw(node.raw));
      },
    });
    return { ast, error: null, ignores: collectIgnores(ast.comments ?? []), strings };
  } catch (e) {
    return { ast: null, error: safeMessage((e as Error).message), ignores: new Map(), strings: new Set() };
  }
}

// Parser messages quote source ("near '\"https://discord.com/api/webhooks/…'"); reports get shared,
// so keep only a short prefix of the quoted text.
const QUOTE_LIMIT = 20;
function safeMessage(message: string): string {
  return message.replace(/near '([\s\S]*)'\s*$/, (_m, text: string) => `near '${text.length > QUOTE_LIMIT ? text.slice(0, QUOTE_LIMIT) + '…' : text}'`);
}

function collectIgnores(comments: { value?: string; raw?: string; loc?: { start: { line: number } } }[]): Ignores {
  const map: Ignores = new Map();
  for (const c of comments) {
    const m = IGNORE.exec(c.value ?? c.raw ?? '');
    if (!m || !c.loc) continue;
    const ids = m[1].match(/[A-Z]{3}\d{3}/g);
    map.set(c.loc.start.line, ids && ids.length ? new Set(ids) : 'all');
  }
  return map;
}

export function isIgnored(ignores: Ignores, line: number, rule: string): boolean {
  for (const l of [line, line - 1]) {
    const v = ignores.get(l);
    if (v === 'all' || (v && v.has(rule))) return true;
  }
  return false;
}
