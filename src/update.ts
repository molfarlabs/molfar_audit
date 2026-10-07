const RELEASES = 'https://api.github.com/repos/molfarlabs/molfar_audit/releases/latest';

function parts(v: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? m.slice(1).map(Number) : null;
}

export function isNewer(current: string, latest: string): boolean {
  const a = parts(current);
  const b = parts(latest);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return b[i] > a[i];
  return false;
}

export async function checkUpdate(version: string, fetchJson: (url: string) => Promise<any>): Promise<string | null> {
  try {
    const latest = await fetchJson(RELEASES);
    return isNewer(version, String(latest?.tag_name ?? '')) ? String(latest.html_url) : null;
  } catch {
    return null;
  }
}
