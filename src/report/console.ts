import type { Severity } from '../rules/types';
import type { Report } from './build';
import { where } from './markdown';

const COLOR: Record<Severity, string> = { critical: '^1', warning: '^3', possible: '^5', info: '^7' };
const TAG = '^2[molfar_audit]^7';
const TOP = 10;

export function formatConsole(report: Report, link: string | null, ttlMinutes: number, savedAs: string): string[] {
  const s = report.summary;
  const b = s.bySeverity;
  const lines = [
    `${TAG} Checked ${s.resources} resources and ${s.luaFiles} Lua files in ${(s.durationMs / 1000).toFixed(1)}s (max server block ${s.maxBlockMs} ms)`,
    `  ^1${b.critical} critical  ^3${b.warning} warning  ^5${b.possible} possible  ^7${b.info} info${s.hidden ? `  (${s.hidden} hidden by ignores)` : ''}${s.unreadableFiles ? `  (${s.unreadableFiles} files unreadable)` : ''}`,
  ];
  for (const f of report.findings.slice(0, TOP)) {
    const at = where(f);
    lines.push(`  ${COLOR[f.severity]}${f.severity.toUpperCase().padEnd(8)}^7 ${f.rule} ${at ? at + ' — ' : ''}${f.message}`);
  }
  if (report.findings.length > TOP) lines.push(`  …and ${report.findings.length - TOP} more in the full report`);
  lines.push(link ? `${TAG} Full report: ^4${link}^7 (valid for ${ttlMinutes} min)` : `${TAG} Web report is disabled.`);
  lines.push(`${TAG} Saved as reports/${savedAs}`);
  return lines;
}
