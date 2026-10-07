import { GROUPS, type Group } from './rules/types';

export function parseGroups(args: string[]): Set<Group> | null {
  if (!args.length) return new Set(GROUPS);
  const out = new Set<Group>();
  for (const a of args) {
    const g = a.toLowerCase() as Group;
    if (!GROUPS.includes(g)) return null;
    out.add(g);
  }
  return out;
}

export function buildLink(baseUrl: string, webBaseUrl: string, resource: string, token: string): string {
  // The legacy users.cfx.re proxy now returns "deprecated-*" hosts that do not answer.
  const proxy = webBaseUrl && !webBaseUrl.startsWith('deprecated-') ? `https://${webBaseUrl}` : '';
  const base = baseUrl || proxy || 'http://YOUR_SERVER_IP:30120';
  return `${base.replace(/\/+$/, '')}/${resource}/?t=${token}`;
}
