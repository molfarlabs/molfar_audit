export async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'molfar_audit' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
