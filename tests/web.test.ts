import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../web/report.html', import.meta.url), 'utf8');

const report = {
  tool: 'molfar_audit', version: '1.0.0', generatedAt: '2026-10-07T10:00:00.000Z', server: { build: 1, recommendedBuild: 1 },
  summary: { resources: 3, luaFiles: 5, unreadableFiles: 0, durationMs: 1500, maxBlockMs: 9, bySeverity: { critical: 1, warning: 1, possible: 0, info: 0 }, byGroup: { manifest: 1, items: 1, config: 0, lua: 0 }, hidden: 0 },
  findings: [
    { rule: 'MAN001', severity: 'critical', group: 'manifest', resource: 'evil', message: '<img src=x onerror="window.pwned=1">', why: 'w', fix: 'f', details: ['<b>x</b>'] },
    { rule: 'ITM001', severity: 'warning', group: 'items', resource: 'shop', file: 'server.lua', line: 4, message: 'Item "x" is not defined', why: 'w', fix: 'f' },
  ],
  markdown: '### md',
};

async function load() {
  let requested = '';
  const dom = new JSDOM(html, {
    url: 'http://server.test/molfar_audit/?t=abc123',
    runScripts: 'dangerously',
    beforeParse(window) {
      (window as any).fetch = async (u: string) => {
        requested = u;
        return { ok: true, status: 200, json: async () => report };
      };
    },
  });
  await new Promise((r) => setTimeout(r, 50));
  return { doc: dom.window.document, window: dom.window as any, requested: () => requested };
}

describe('report.html', () => {
  it('fetches report.json with the token from the page folder', async () => {
    const { requested } = await load();
    expect(requested()).toBe('/molfar_audit/report.json?t=abc123');
  });

  it('renders findings as text, never as HTML', async () => {
    const { doc, window } = await load();
    expect(doc.querySelectorAll('.finding')).toHaveLength(2);
    expect(doc.querySelector('.finding img')).toBeNull();
    expect(doc.querySelector('.finding b')).toBeNull();
    expect(window.pwned).toBeUndefined();
    expect(doc.body.textContent).toContain('<img src=x onerror="window.pwned=1">');
  });

  it('filters by severity', async () => {
    const { doc, window } = await load();
    const sel = doc.getElementById('severity') as HTMLSelectElement;
    sel.value = 'critical';
    sel.dispatchEvent(new window.Event('change'));
    const visible = [...doc.querySelectorAll('.finding')].filter((e) => !(e as HTMLElement).hidden);
    expect(visible).toHaveLength(1);
  });
});
