import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Report } from './build';

const pad = (n: number) => String(n).padStart(2, '0');

export function stamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export async function saveReport(dir: string, report: Report, keep: number, now: Date): Promise<string> {
  await mkdir(dir, { recursive: true });
  const name = `${stamp(now)}.json`;
  await writeFile(join(dir, name), JSON.stringify(report, null, 2));
  const files = (await readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}_\d{6}\.json$/.test(f)).sort();
  for (const old of files.slice(0, Math.max(0, files.length - keep))) await unlink(join(dir, old));
  return name;
}
