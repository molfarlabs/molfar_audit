# FXServer runtime facts (spike, 2026-10-07, dev server, artifact 35245 linux)

| Check | Result |
|---|---|
| `node_version '22'` | works, `process.version` = v22.22.0 |
| `process.cwd()` | server data folder (`/opt/fivem/txData/Qbox_C61868.base`) |
| Read **other resources** (`fs.readdirSync`, `statSync`, `readFileSync`, `openSync` on `GetResourcePath(x)`) | **allowed** |
| Read `server.cfg` / list `resources/` root | **denied** — `ERR_ACCESS_DENIED` (2026 filesystem sandbox: "operations in the server main folder are blocked") |
| `@resource/path` with Node `fs` | not supported (ENOENT); use `GetResourcePath()` |
| Write inside own resource folder | allowed |
| `LoadResourceFile(other, file)` | works |
| `globalThis.exports.ox_inventory.Items()` | works (303 items on Qbox recipe) |
| `fetch`, `setImmediate` | available |
| `GetRegisteredCommands()` | works (563 commands) |
| `RegisterConsoleListener` | available |
| `GetConvar('version')` | `FXServer-master v1.0.0.35245 linux` (no `SERVER` word) |
| `GetConvar('web_baseUrl')` | `deprecated-988jlqk.users.cfx.re` — the proxy does **not** answer (curl 000) |
| HTTP handler `req.path` | `/report.json?t=abc` (resource prefix stripped, query kept) |
| HTTP handler `req.address` | `<client-ip>:57952` (ip:port) |

Minimum supported artifact for README: **35245** (verified). Older builds untested.

Sources: https://docs.fivem.net/docs/developers/sandbox/ , https://github.com/citizenfx/fivem/issues/3856
