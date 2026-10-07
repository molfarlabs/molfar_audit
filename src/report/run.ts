import type { Finding, Group, Rule, RuleContext } from '../rules/types';
import type { ServerSnapshot } from '../snapshot';
import { createYielder } from '../util/yield';

export async function runRules(rules: Rule[], s: ServerSnapshot, ctx: RuleContext, groups: Set<Group>): Promise<Finding[]> {
  const out: Finding[] = [];
  const tick = createYielder();
  for (const rule of rules) {
    if (!groups.has(rule.group) || !ctx.config.groups[rule.group]) continue;
    try {
      if (rule.file) {
        const found: Finding[] = [...(rule.once?.(s, ctx) ?? [])];
        for (const file of s.lua.values()) {
          try {
            found.push(...rule.file(file, s, ctx));
          } catch (e) {
            found.push({
              rule: rule.id, severity: 'info', group: rule.group, resource: file.resource, file: file.rel,
              message: `Rule ${rule.id} skipped this file: ${(e as Error).message}`,
              why: 'An internal error stopped this check for one file; other files were still checked.',
              fix: 'Please report it at https://github.com/molfarlabs/molfar_audit/issues',
            });
          }
          await tick();
        }
        out.push(...found);
      } else {
        out.push(...rule.run(s, ctx));
      }
    } catch (e) {
      out.push({
        rule: rule.id, severity: 'info', group: rule.group,
        message: `Rule ${rule.id} failed: ${(e as Error).message}`,
        why: 'An internal error stopped this check; all other checks still ran.',
        fix: 'Please report it at https://github.com/molfarlabs/molfar_audit/issues',
      });
    }
    await tick();
  }
  return out;
}
