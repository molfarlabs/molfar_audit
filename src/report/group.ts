import type { Finding } from '../rules/types';

export interface FindingGroup {
  finding: Finding;
  lines: number[];
  count: number;
}

const MAX_LINES = 12;

// Identical findings in one file (same rule and message) read better as one entry with all line numbers.
export function groupFindings(findings: Finding[]): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();
  for (const f of findings) {
    const key = [f.rule, f.resource ?? '', f.file ?? '', f.message].join('\u0000');
    const g = groups.get(key);
    if (g) {
      g.count++;
      if (f.line) g.lines.push(f.line);
    } else {
      groups.set(key, { finding: f, lines: f.line ? [f.line] : [], count: 1 });
    }
  }
  return [...groups.values()];
}

export function groupWhere(g: FindingGroup): string {
  const base = [g.finding.resource, g.finding.file].filter(Boolean).join('/');
  if (!g.lines.length) return base;
  const shown = g.lines.slice(0, MAX_LINES).join(',');
  return `${base}:${shown}${g.lines.length > MAX_LINES ? ',…' : ''}`;
}
