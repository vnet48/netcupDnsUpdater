# AGENTS.md - NetCup DNS Updater

Single-file Bun/TypeScript service (no framework, no build step) that updates a
NetCup DNS `A` record with the Fritzbox's current IP. Dependencies are npm
packages (`package.json` + `bun.lock`). The Deno era ended with the Bun
migration: `deno.json`/`deno.lock` are gone, `Deno.*` APIs are replaced by
`Bun.serve`/`Bun.env`.

## Commands
```bash
bun run dev      # bun --watch run main.ts
bun run start    # bun run main.ts
bun run build:sfe  # cross-compile dist/netcup-dns-updater-linux-x64 (bun-linux-x64/glibc)
bun test         # 40 unit/integration tests, fetch stubbed — no network
bun x tsc --noEmit   # typecheck (tsconfig.json, "types": ["bun"])
bun x biome check    # lint + format (biome.json); use `--write` to apply fixes
```
Biome covers `*.ts`, `*.json` — not Markdown. `node_modules/` and `.env` are
gitignored; commit `bun.lock`. There is no CI workflow.

## Env vars — only these are read (main.ts)
```
NETCUP_API_KEY, NETCUP_API_PASSWORD, NETCUP_CUSTOMER_NUMBER
ALLOWED_IP=<ip that may call /update>   # required, else EVERY request gets 403
PORT=3000                               # default 3000
BIND_HOST=0.0.0.0                       # bind address (default 0.0.0.0)
```
- `.env` is auto-loaded by Bun at process start (no dotenv import anymore).
  Copy `example.env` to `.env`. Compiled single-file executables do the same
  (Bun's `autoloadDotenv` defaults to true).
- The old `HOSTNAME` variable was renamed to `BIND_HOST` on purpose: Docker
  (and bash) set `HOSTNAME` automatically to the (container) hostname, which
  was never a valid bind address. There is deliberately **no fallback** to
  `HOSTNAME`.
- `DOMAIN`/`HOST` from the old example.env were never read by the code and are
  gone. The domain comes from the `?domain=` query param, not from env.
- Every var defaults to `""`: the server **starts fine without `.env`** and
  answers 403 to everything. Don't expect a crash as a config signal.
- `ALLOWED_IP` compares against the **direct TCP peer** (via
  `server.requestIP`), no `X-Forwarded-For`. Behind a proxy / published Docker
  port the peer is the proxy or docker gateway IP, not the Fritzbox.

## Architecture
- `main.ts` — exports `createHandler(config)` returning an async
  `(req: Request, server: ConnInfo) => Response` handler. Logtape setup and
  `Bun.serve` only run under `if (import.meta.main)`, so tests can import the
  handler without starting a server. `config.updateDns` is injectable for
  tests (defaults to `updateNetcupDns`). Only `/update?ip=<ip>&domain=<domain>`
  exists, everything else 404.
- `utils.ts` — `getRemoteAddress(connInfo, request)`, `updateNetcupDns()`,
  `updateIpInDnsRecord()` (hardcodes the record `hostname === "@" && type ===
  "A"`; mutates and returns it). `ConnInfo`/`NetAddr` are minimal structural
  types matching Bun's `Server.requestIP`, fakeable in tests.
  **`server.requestIP()` reports IPv4 peers as `::ffff:<ip>` on dual-stack
  sockets; `getRemoteAddress` strips that prefix** — without it the
  `ALLOWED_IP` check silently fails. Regression test: `utils_test.ts`
  "getRemoteAddress - strips the ::ffff: prefix of IPv4-mapped addresses".
- `netcup_api.ts` — all calls are `POST` to one URL
  `https://ccp.netcup.net/run/webservice/servers/endpoint.php?JSON` with
  `{action, param}` bodies. Session flow: `login` → `infoDnsRecords` →
  `updateDnsRecords` → `logout`. Success means HTTP 200 **and** body
  `statuscode === 2000` — NetCup also answers 200 on many failures. Bun types
  `resp.json()` as `unknown` (Deno had `any`), hence the `as <Response>` casts.
- `interfaces.ts` — API types only.
- Errors are signalled as `false`/`null` + `console.error`; API layer swallows
  exceptions, so real causes are only in the console.
- `updateNetcupDns` closes the API session in a `finally` whenever login
  succeeded — logout runs on every failure path too. A failed logout is
  best-effort cleanup: it is only logged and never turns a successful update
  into `false`.

## Bug history (fixed)
- `main.ts` used to call `if (!updateNetcupDns(...))` **without `await`** → the
  Promise is always truthy → the endpoint replied `200 Ok` even when
  login/update failed. Fixed: the handler now `await`s and answers 500 on
  failure. Regression tests: `main_test.ts` "handler - returns 500 when the DNS
  update fails" and "...uses the real update flow by default".
- `updateNetcupDns` used to skip `logout` on the info/match/update failure
  paths, leaking the API session until NetCup times it out. Fixed with
  try/finally; logout failure no longer fails an applied update. Regression
  tests: the "returns false when ..." paths in `utils_test.ts` assert the
  `logout` call, "returns true when only the logout fails" pins the
  best-effort semantics.

## Logging
`@logtape/logtape` (npm, v2), configured in `main.ts`. Category
`netcup-dns-updater` at `debug`, plus the `logtape/meta` logger at `warning`.
The tagged-template API (`logger.info\`...\``) works unchanged under Bun.
`console.error` calls in `utils.ts` / `netcup_api.ts` are legacy and bypass
this.

## Testing / deploy
```bash
bun test          # unit/integration tests; fetch stubbed via test_helpers.ts (local stub() with Symbol.dispose), no network/.env needed
bun run start &   # needs .env with ALLOWED_IP=127.0.0.1 for local curl
curl "http://127.0.0.1:3000/update?ip=1.2.3.4&domain=example.com"   # 403 = allowlist mismatch, 400 = missing params, 404 = bad path, 500 = NetCup call failed
```
`docker compose up` uses `Dockerfile` — multi-stage: `oven/bun:1-slim` builds a
single-file executable (`bun build --compile --format=esm --minify --sourcemap
--bytecode --target=bun-linux-<arch>-musl`, arch from `TARGETARCH`), final
stage is `alpine:3.21` running it as uid 10001. No `node_modules` or Bun in
the image. Compose passes only `NETCUP_*` + `ALLOWED_IP` via interpolation
from the host `.env`; `PORT`/`BIND_HOST` are deliberately not set — code
defaults (3000/0.0.0.0) match the fixed `3000:3000` port mapping.
- SFE build gotchas (verified): `--bytecode` + top-level `await` fails with
  `"await" can only be used inside an "async" function` unless `--format=esm`
  is passed. The musl build is **not fully static** — besides
  `/lib/ld-musl-x86_64.so.1` it dynamically links `libstdc++.so.6`; plain
  Alpine doesn't ship it, so the Dockerfile runtime stage needs
  `apk add --no-cache libstdc++ libgcc` (otherwise the container crash-loops
  with "Error loading shared library libstdc++.so.6" + dozens of
  `symbol not found` lines). `bun run build:sfe` therefore targets
  plain `bun-linux-x64` (glibc) so the binary can be scp'd onto a normal
  Debian/Ubuntu server and run directly (see README). `import.meta.main` is
  true inside the compiled binary, `.env` autoload applies there too — the SFE
  behaves exactly like `bun run main.ts`.

## Fritzbox
Internet → Freigaben → DynDns, URL
`http://<server-ip>:<server-port>/update?ip=<ipaddr>&domain=<domain>` (the
Fritzbox fills `<ipaddr>`/`<domain>`). See README.
