import type { AuditConfig } from '../config';
import type { LuaFile, ServerSnapshot } from '../snapshot';

export type Severity = 'critical' | 'warning' | 'possible' | 'info';
export type Group = 'manifest' | 'items' | 'config' | 'lua';

export const GROUPS: Group[] = ['manifest', 'items', 'config', 'lua'];
export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, possible: 2, info: 3 };

export interface Finding {
  rule: string;
  severity: Severity;
  group: Group;
  resource?: string;
  file?: string;
  line?: number;
  message: string;
  why: string;
  fix: string;
  details?: string[];
}

export interface RuleContext {
  config: AuditConfig;
}

export type FileCheck = (file: LuaFile, snapshot: ServerSnapshot, ctx: RuleContext) => Finding[];
export type OnceCheck = (snapshot: ServerSnapshot, ctx: RuleContext) => Finding[];

export interface Rule {
  id: string;
  group: Group;
  run(snapshot: ServerSnapshot, ctx: RuleContext): Finding[];
  // Per-file rules let the runner yield between files instead of blocking the server.
  file?: FileCheck;
  once?: OnceCheck;
}

export function perFileRule(id: string, group: Group, file: FileCheck, once?: OnceCheck): Rule {
  return {
    id,
    group,
    file,
    once,
    run: (s, ctx) => [...(once?.(s, ctx) ?? []), ...[...s.lua.values()].flatMap((f) => file(f, s, ctx))],
  };
}
