// Acceptance: every rule fires on its fixture; clean fixtures stay clean.
import { readFileSync } from 'node:fs';

const report = JSON.parse(readFileSync(process.argv[2] ?? 'tmp/last-report.json', 'utf8'));
const f = report.findings;
const has = (rule, pred = () => true) => f.some((x) => x.rule === rule && pred(x));

const expectations = [
  ['MAN001', (x) => x.resource === 'mfx_man001'],
  ['MAN002', (x) => x.resource === 'mfx_man002'],
  ['MAN003', (x) => x.resource === 'mfx_man003' && x.file === 'client/missing.lua'],
  ['MAN004', (x) => x.resource === 'mfx_man004'],
  ['MAN005', (x) => x.resource === 'mfx_man005'],
  ['MAN006', (x) => x.resource === 'mfx_man006'],
  ['MAN007', (x) => x.resource === 'mfx_man007'],
  ['MAN008', (x) => (x.details ?? []).includes('mfx_man008a')],
  ['MAN009', (x) => x.resource === 'mfx_man009'],
  ['ITM001', (x) => x.resource === 'mfx_items' && x.message.includes('mfx_unknown_item')],
  ['ITM002', (x) => (x.details ?? []).includes('mfx_noimage')],
  ['ITM003', () => true],
  ['LUA001', (x) => x.resource === 'mfx_lua' && x.line === 3],
  ['LUA002', (x) => x.resource === 'mfx_lua' && x.file === 'client.lua'],
  ['LUA003', (x) => x.resource === 'mfx_lua' && x.line === 6],
  ['LUA004', (x) => (x.details ?? []).some((d) => d.startsWith('mfx_lua/broken.lua'))],
  ['CFG007', () => true],
];

const failures = expectations.filter(([rule, pred]) => !has(rule, pred)).map(([rule]) => `missing ${rule}`);
const clean = f.filter((x) => x.resource === 'mfx_clean' || (x.details ?? []).some((d) => d.startsWith('mfx_clean/')));
for (const x of clean) failures.push(`false positive on mfx_clean: ${x.rule} ${x.message}`);

console.log(`summary: ${JSON.stringify(report.summary.bySeverity)} in ${report.summary.durationMs} ms, max block ${report.summary.maxBlockMs} ms`);
if (report.summary.durationMs >= 10_000) failures.push(`too slow: ${report.summary.durationMs} ms`);
if (report.summary.maxBlockMs >= 100) failures.push(`server blocked ${report.summary.maxBlockMs} ms`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('all fixture expectations met');
