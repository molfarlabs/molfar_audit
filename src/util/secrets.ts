const USER_KEYS = ['user', 'uid', 'username', 'user id'];
const PASSWORD_KEYS = ['password', 'pwd', 'pass'];

export function parseMysqlConnection(s: string): { user: string | null; password: string | null } {
  const value = s.trim();
  if (/^mysql:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      return { user: decodeURIComponent(u.username) || null, password: decodeURIComponent(u.password) };
    } catch {
      return { user: null, password: null };
    }
  }
  if (!value.includes('=')) return { user: null, password: null };
  const pairs = new Map<string, string>();
  for (const part of value.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    pairs.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim());
  }
  const pick = (keys: string[]) => keys.map((k) => pairs.get(k)).find((v) => v !== undefined);
  const user = pick(USER_KEYS);
  const password = pick(PASSWORD_KEYS);
  if (user === undefined && password === undefined) return { user: null, password: null };
  return { user: user ?? null, password: password ?? '' };
}
