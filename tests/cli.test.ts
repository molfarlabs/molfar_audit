import { describe, expect, it } from 'vitest';
import { buildLink, parseGroups } from '../src/cli';
import { checkUpdate, isNewer } from '../src/update';

describe('parseGroups', () => {
  it('defaults to all groups', () => {
    expect([...parseGroups([])!]).toEqual(['manifest', 'items', 'config', 'lua']);
  });
  it('accepts a subset, case-insensitive', () => {
    expect([...parseGroups(['Items', 'lua'])!]).toEqual(['items', 'lua']);
  });
  it('rejects unknown groups', () => {
    expect(parseGroups(['bogus'])).toBeNull();
  });
});

describe('buildLink', () => {
  it('prefers configured base URL, then web_baseUrl, then a placeholder', () => {
    expect(buildLink('https://audit.example.com/', 'x.users.cfx.re', 'molfar_audit', 't1')).toBe('https://audit.example.com/molfar_audit/?t=t1');
    expect(buildLink('', 'x.users.cfx.re', 'molfar_audit', 't1')).toBe('https://x.users.cfx.re/molfar_audit/?t=t1');
    expect(buildLink('', '', 'molfar_audit', 't1')).toBe('http://YOUR_SERVER_IP:30120/molfar_audit/?t=t1');
  });
  it('ignores the dead deprecated-* users.cfx.re proxy', () => {
    expect(buildLink('', 'deprecated-988jlqk.users.cfx.re', 'molfar_audit', 't1')).toBe('http://YOUR_SERVER_IP:30120/molfar_audit/?t=t1');
  });
});

describe('isNewer / checkUpdate', () => {
  it('compares semver', () => {
    expect(isNewer('1.0.0', '1.0.1')).toBe(true);
    expect(isNewer('1.2.0', '1.10.0')).toBe(true);
    expect(isNewer('1.0.0', 'v1.0.0')).toBe(false);
    expect(isNewer('1.1.0', '1.0.9')).toBe(false);
    expect(isNewer('1.0.0', 'garbage')).toBe(false);
  });
  it('returns the release URL when newer, null otherwise or on error', async () => {
    const latest = async () => ({ tag_name: 'v1.1.0', html_url: 'https://github.com/molfarlabs/molfar_audit/releases/tag/v1.1.0' });
    expect(await checkUpdate('1.0.0', latest)).toContain('v1.1.0');
    expect(await checkUpdate('1.1.0', latest)).toBeNull();
    expect(await checkUpdate('1.0.0', async () => { throw new Error('x'); })).toBeNull();
  });
});
