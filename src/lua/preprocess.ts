// Rewrites CfxLua / Lua 5.4 extensions into Lua 5.3 that luaparse understands.
// Every rewrite keeps the line count; findings only report lines.

function longBracket(src: string, i: number): { close: string; contentStart: number } | null {
  if (src[i] !== '[') return null;
  let j = i + 1;
  let eq = 0;
  while (src[j] === '=') {
    eq++;
    j++;
  }
  if (src[j] !== '[') return null;
  return { close: ']' + '='.repeat(eq) + ']', contentStart: j + 1 };
}

const ATTRIBUTE = /^<\s*(const|close)\s*>/;
const COMPOUND_OP = /^(\.\.|<<|>>|\/\/|[-+*/%^&|])=(?!=)/;
const LVALUE = /([A-Za-z_]\w*(?:\s*(?:\.\s*[A-Za-z_]\w*|\[[^\]\n]*\]))*)\s*$/;
const UNPACK = /^(\s*local\s+)([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s+in\s+(.+?)\s*(--.*)?$/;

function rewriteLine(line: string): string {
  const u = UNPACK.exec(line);
  if (u) {
    const [, head, names, source, comment] = u;
    const list = names.split(',').map((n) => n.trim());
    return `${head}${list.join(', ')} = ${list.map((n) => `(${source}).${n}`).join(', ')}${comment ? ' ' + comment : ''}`;
  }
  return line;
}

const LOOKBEHIND = 200;

export function preprocess(src: string): string {
  // Completed lines go to `lines`; the current line stays in `cur`, so the compound
  // assignment lookbehind never rescans the whole output (keeps this linear).
  const lines: string[] = [];
  let cur = '';
  const emit = (text: string) => {
    const nl = text.lastIndexOf('\n');
    if (nl === -1) {
      cur += text;
    } else {
      lines.push(cur + text.slice(0, nl + 1));
      cur = text.slice(nl + 1);
    }
  };
  const n = src.length;
  let i = 0;
  while (i < n) {
    const ch = src[i];

    if (ch === '-' && src[i + 1] === '-') {
      const long = longBracket(src, i + 2);
      let stop: number;
      if (long) {
        const end = src.indexOf(long.close, long.contentStart);
        stop = end === -1 ? n : end + long.close.length;
      } else {
        const nl = src.indexOf('\n', i);
        stop = nl === -1 ? n : nl;
      }
      emit(src.slice(i, stop));
      i = stop;
      continue;
    }

    if (ch === '[') {
      const long = longBracket(src, i);
      if (long) {
        const end = src.indexOf(long.close, long.contentStart);
        const stop = end === -1 ? n : end + long.close.length;
        emit(src.slice(i, stop));
        i = stop;
        continue;
      }
    }

    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && src[j] !== ch && src[j] !== '\n') {
        if (src[j] === '\\') j++;
        j++;
      }
      const stop = Math.min(j + 1, n);
      emit(src.slice(i, stop));
      i = stop;
      continue;
    }

    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const content = src.slice(i + 2, end === -1 ? n : end);
      let eq = '=';
      while (content.includes(']' + eq + ']')) eq += '=';
      emit(`--[${eq}[${content}]${eq}]`);
      i = end === -1 ? n : end + 2;
      continue;
    }

    // `a op= b` anywhere in code → `a = a op b` (precedence may differ; only parseability matters).
    if ('.<>/-+*%^&|'.includes(ch)) {
      const op = COMPOUND_OP.exec(src.slice(i, i + 4));
      if (op) {
        const lhs = LVALUE.exec(cur.slice(-LOOKBEHIND));
        if (lhs) {
          emit(`= ${lhs[1]} ${op[1]}`);
          i += op[0].length;
          continue;
        }
      }
    }

    if (ch === '`') {
      const j = src.indexOf('`', i + 1);
      if (j !== -1 && !src.slice(i + 1, j).includes('\n')) {
        emit('"' + src.slice(i + 1, j) + '"');
        i = j + 1;
        continue;
      }
    }

    if (ch === '?' && (src[i + 1] === '.' || src[i + 1] === '[' || src[i + 1] === ':')) {
      emit(' ');
      i++;
      continue;
    }

    if (ch === '<') {
      const m = ATTRIBUTE.exec(src.slice(i, i + 16));
      if (m) {
        emit(' '.repeat(m[0].length));
        i += m[0].length;
        continue;
      }
    }

    if (ch === '\n') {
      lines.push(cur + ch);
      cur = '';
    } else {
      cur += ch;
    }
    i++;
  }
  lines.push(cur);
  return lines.join('').split('\n').map(rewriteLine).join('\n');
}
