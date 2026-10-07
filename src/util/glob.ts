import picomatch from 'picomatch';

// FiveM paths use [category] folders literally, so brackets are never character classes here.
const escapeBrackets = (p: string) => p.replace(/[[\]]/g, '\\$&');

export const isGlob = (p: string) => /[*?{}]/.test(p);

export function globMatcher(pattern: string): (value: string) => boolean {
  const normalized = escapeBrackets(pattern.replace(/\*\*(?!\/)/g, '**/*'));
  return picomatch(normalized, { dot: false });
}
