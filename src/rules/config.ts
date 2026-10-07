import { UNSET, type ServerSnapshot } from '../snapshot';
import type { Finding, Rule, Severity } from './types';

// Rules here must never put convar values into findings: they can be secrets.
const cv = (s: ServerSnapshot, name: string): string | undefined => {
  const v = s.convars[name];
  return v === undefined || v === UNSET ? undefined : v;
};

function simple(id: string, severity: Severity, test: (s: ServerSnapshot) => boolean, message: string, why: string, fix: string): Rule {
  return {
    id,
    group: 'config',
    run: (s) => (test(s) ? [{ rule: id, severity, group: 'config', file: 'server.cfg', message, why, fix }] : []),
  };
}

const truthy = (v: string | undefined) => v !== undefined && ['1', 'true'].includes(v.toLowerCase());

const CFG001 = simple('CFG001', 'critical', (s) => truthy(cv(s, 'sv_scriptHookAllowed')),
  'sv_scriptHookAllowed is enabled',
  'It lets clients load ScriptHook mods, which is how most cheat menus get in.',
  'Remove the line or set sv_scriptHookAllowed 0.');

const CFG002 = simple('CFG002', 'critical', (s) => ['off', 'false', ''].includes((cv(s, 'onesync') ?? 'off').toLowerCase()),
  'OneSync is off',
  'Qbox, QBCore, ESX Legacy and ox_* resources require OneSync.',
  'Start the server with OneSync on (txAdmin: Settings → FXServer → OneSync).');

const CFG003: Rule = {
  id: 'CFG003',
  group: 'config',
  run(s) {
    const out: Finding[] = [];
    if (s.db.user === 'root') {
      out.push({ rule: 'CFG003', severity: 'critical', group: 'config', file: 'server.cfg', message: 'mysql_connection_string uses the root user',
        why: 'Any SQL injection in any resource gets full control of every database on the host.',
        fix: 'Create a dedicated database user with rights only on the server database.' });
    }
    if (s.db.passwordEmpty === true) {
      out.push({ rule: 'CFG003', severity: 'critical', group: 'config', file: 'server.cfg', message: 'mysql_connection_string has an empty password',
        why: 'A database without a password is one firewall mistake away from being public.',
        fix: 'Set a strong password for the database user and update mysql_connection_string.' });
    }
    return out;
  },
};

const CFG004 = simple('CFG004', 'warning', (s) => !cv(s, 'sv_enforceGameBuild'),
  'sv_enforceGameBuild is not set',
  'Without it players join on the oldest game build and miss newer vehicles, clothes and map changes.',
  'Add set sv_enforceGameBuild <build> (for example 3258) to server.cfg.');

const CFG005 = simple('CFG005', 'warning', (s) => (cv(s, 'rcon_password') ?? '').length > 0,
  'rcon_password is set',
  'RCON sends the password in plain text over UDP and is a common attack target.',
  'Remove rcon_password and manage the server through txAdmin.');

const CFG006: Rule = {
  id: 'CFG006',
  group: 'config',
  run(s) {
    if (s.recommendedBuild === null) {
      return [{ rule: 'CFG006', severity: 'info', group: 'config', message: 'Could not check the FXServer version',
        why: 'The Cfx.re version API did not answer.', fix: 'Nothing to do; the check runs again next time.' }];
    }
    if (s.serverBuild !== null && s.serverBuild < s.recommendedBuild) {
      return [{ rule: 'CFG006', severity: 'warning', group: 'config', message: `FXServer build ${s.serverBuild} is older than the recommended ${s.recommendedBuild}`,
        why: 'Old builds miss security and stability fixes, and new resources may require newer natives.',
        fix: 'Update the server artifacts (txAdmin or your host panel → update FXServer).' }];
    }
    return [];
  },
};

const CFG007: Rule = {
  id: 'CFG007',
  group: 'config',
  run(s) {
    const details: string[] = [];
    if (cv(s, 'sv_master1') !== '') details.push('Server is listed in the public server list (sv_master1 is not empty)');
    const steam = cv(s, 'steam_webApiKey');
    if (!steam || steam.toLowerCase() === 'none') details.push('steam_webApiKey is not set, so Steam identifiers are unavailable');
    if ((cv(s, 'sv_hostname') ?? '').includes('built with')) details.push('sv_hostname still contains the recipe default text');
    return details.length
      ? [{ rule: 'CFG007', severity: 'info', group: 'config', file: 'server.cfg', message: `${details.length} minor server.cfg notes`,
          why: 'Small things worth a look before going public.', fix: 'Review each note and change server.cfg if needed.', details }]
      : [];
  },
};

export const configRules: Rule[] = [CFG001, CFG002, CFG003, CFG004, CFG005, CFG006, CFG007];
