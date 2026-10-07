import type { AuditConfig, IgnoreEntry } from '../config';
import { isIgnored } from '../lua/parse';
import { GROUPS, SEVERITY_ORDER, type Finding, type Group, type Severity } from '../rules/types';
import type { ServerSnapshot } from '../snapshot';
import { globMatcher } from '../util/glob';
import { toMarkdown } from './markdown';

export interface Summary {
  resources: number;
  luaFiles: number;
  unreadableFiles: number;
  durationMs: number;
  maxBlockMs: number;
  bySeverity: Record<Severity, number>;
  byGroup: Record<Group, number>;
  hidden: number;
}

export interface Report {
  tool: 'molfar_audit';
  version: string;
  generatedAt: string;
  server: { build: number | null; recommendedBuild: number | null };
  summary: Summary;
  findings: Finding[];
  markdown: string;
}

// Within a level: things that break the server first, manifest hygiene last.
const GROUP_ORDER: Record<Group, number> = { config: 0, items: 1, lua: 2, manifest: 3 };

function ignoredByConfig(f: Finding, entries: IgnoreEntry[], categories: Map<string, string>): boolean {
  const path = [categories.get(f.resource ?? '') ?? '', f.resource, f.file].filter(Boolean).join('/');
  return entries.some(
    (e) =>
      (!e.rule || e.rule === f.rule) &&
      (!e.resource || (!!f.resource && globMatcher(e.resource)(f.resource))) &&
      (!e.path || globMatcher(e.path)(path)),
  );
}

function ignoredInline(f: Finding, s: ServerSnapshot): boolean {
  if (!f.resource || !f.file || !f.line) return false;
  const file = s.lua.get(`${f.resource}/${f.file}`);
  return !!file && isIgnored(file.ignores, f.line, f.rule);
}

export function buildReport(raw: Finding[], s: ServerSnapshot, config: AuditConfig, meta: { version: string; durationMs: number; maxBlockMs: number; now: Date }): Report {
  const categories = new Map(s.resources.map((r) => [r.name, r.category]));
  const findings: Finding[] = [];
  let hidden = 0;
  for (const f of raw) {
    if (ignoredByConfig(f, config.ignore, categories) || ignoredInline(f, s)) hidden++;
    else findings.push(f);
  }
  findings.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
      (a.resource ?? '').localeCompare(b.resource ?? '') ||
      (a.file ?? '').localeCompare(b.file ?? '') ||
      (a.line ?? 0) - (b.line ?? 0),
  );
  const bySeverity: Record<Severity, number> = { critical: 0, warning: 0, possible: 0, info: 0 };
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g, 0])) as Record<Group, number>;
  for (const f of findings) {
    bySeverity[f.severity]++;
    byGroup[f.group]++;
  }
  const summary: Summary = {
    resources: s.resources.length,
    luaFiles: s.lua.size,
    unreadableFiles: s.unreadableFiles,
    durationMs: meta.durationMs,
    maxBlockMs: meta.maxBlockMs,
    bySeverity,
    byGroup,
    hidden,
  };
  return {
    tool: 'molfar_audit',
    version: meta.version,
    generatedAt: meta.now.toISOString(),
    server: { build: s.serverBuild, recommendedBuild: s.recommendedBuild },
    summary,
    findings,
    markdown: toMarkdown(findings, summary),
  };
}
