import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLink, parseGroups } from './cli';
import { buildSnapshot } from './collect/index';
import { fxNatives } from './collect/natives';
import { DEFAULT_CONFIG, parseConfig, type AuditConfig } from './config';
import { createHttpHandler, newToken, type Published } from './http';
import { buildReport } from './report/build';
import { formatConsole } from './report/console';
import { runRules } from './report/run';
import { saveReport } from './report/store';
import { ALL_RULES } from './rules/index';
import { checkUpdate } from './update';
import { startLagMonitor } from './util/lag';
import { fetchJson } from './util/net';

const RESOURCE = GetCurrentResourceName();
const ROOT = GetResourcePath(RESOURCE);
const VERSION = GetResourceMetadata(RESOURCE, 'version', 0) || '0.0.0';
const TAG = '^2[molfar_audit]^7';

let running = false;
let published: Published | null = null;
let lastLink: string | null = null;

function loadConfig(): AuditConfig {
  let text: string;
  try {
    text = readFileSync(join(ROOT, 'config.json'), 'utf8');
  } catch {
    return DEFAULT_CONFIG;
  }
  const { config, error, warnings } = parseConfig(text);
  if (error) console.log(`^1[molfar_audit] ${error}^7`);
  for (const w of warnings) console.log(`^3[molfar_audit] config.json: ${w}^7`);
  return config;
}

function loadHtml(): string | null {
  try {
    return readFileSync(join(ROOT, 'web', 'report.html'), 'utf8');
  } catch {
    return null;
  }
}

async function audit(args: string[]): Promise<void> {
  if (args[0]?.toLowerCase() === 'last') {
    const live = lastLink && published && Date.now() < published.expiresAt;
    console.log(live ? `${TAG} Last report: ^4${lastLink}^7` : `${TAG} No active report link — run the audit again.`);
    return;
  }
  const groups = parseGroups(args);
  if (!groups) {
    console.log(`${TAG} Usage: audit [manifest|items|config|lua ...] | audit last`);
    return;
  }
  if (running) {
    console.log(`${TAG} ^3An audit is already running.^7`);
    return;
  }
  running = true;
  const config = loadConfig();
  const started = Date.now();
  const stopLag = startLagMonitor();
  console.log(`${TAG} Audit started…`);
  try {
    const snapshot = await buildSnapshot(fxNatives(), { fetchJson, now: new Date() });
    const findings = await runRules(ALL_RULES, snapshot, { config }, groups);
    const report = buildReport(findings, snapshot, config, { version: VERSION, durationMs: Date.now() - started, maxBlockMs: stopLag(), now: new Date() });
    const savedAs = await saveReport(join(ROOT, 'reports'), report, config.reports.keep, new Date());
    let link: string | null = null;
    const html = loadHtml();
    if (config.web.enabled && html) {
      published = { token: newToken(), expiresAt: Date.now() + config.web.tokenTtlMinutes * 60_000, json: JSON.stringify(report) };
      link = buildLink(config.web.baseUrl, GetConvar('web_baseUrl', ''), RESOURCE, published.token);
      lastLink = link;
    } else if (config.web.enabled) {
      console.log(`${TAG} ^3web/report.html is missing — web report disabled.^7`);
    }
    for (const line of formatConsole(report, link, config.web.tokenTtlMinutes, savedAs)) console.log(line);
  } catch (e) {
    stopLag();
    console.log(`^1[molfar_audit] Audit failed: ${(e as Error).stack ?? e}^7`);
  } finally {
    running = false;
  }
}

const startupConfig = loadConfig();
let command = startupConfig.command;
if (GetRegisteredCommands().some((c) => c.name === command)) {
  console.log(`${TAG} ^3Command "${command}" is already used by another resource — use "molfar_audit" instead.^7`);
  command = 'molfar_audit';
}
RegisterCommand(command, (_source, args) => void audit(args), true);
SetHttpHandler(createHttpHandler({ current: () => published, html: loadHtml, now: () => Date.now() }));
console.log(`${TAG} v${VERSION} ready — type "${command}" in the server console.`);

const autorun = Number(GetConvar('molfar_audit:autorun', '0'));
if (autorun > 0) setTimeout(() => void audit([]), autorun * 1000);

if (startupConfig.updateCheck) {
  void checkUpdate(VERSION, fetchJson).then((url) => {
    if (url) console.log(`${TAG} ^3A new version is available: ${url}^7`);
  });
}
