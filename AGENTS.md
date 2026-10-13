# AGENTS.md - NetCup DNS Updater

Single-file Deno/TypeScript service (no framework, no build step) that updates a NetCup DNS `A` record with the Fritzbox's current IP. Repo folder says "Bun" but **Bun cannot run this** (verified: it fails resolving `@std/dotenv/load`; there is no `Deno` global in Bun). No `package.json` — deps come from `deno.json` `imports` (JSR).

## Commands
```bash
deno task dev      # deno run --watch -RNE main.ts
deno task start    # deno run -RNE main.ts
deno task test     # deno test (39 unit/integration tests, fetch stubbed — no network)
deno check main.ts && deno lint && deno fmt   # verification order
```
`deno fmt`/`lint` cover Markdown too — `deno fmt --check` fails on `README.md`/`AGENTS.md` (prose line width) while all `*.ts` are clean, so format code with `deno fmt *.ts` and don't "fix" the docs. There is no CI workflow.

## Env vars — only these are read (main.ts)
```
NETCUP_API_KEY, NETCUP_API_PASSWORD, NETCUP_CUSTOMER_NUMBER
ALLOWED_IP=<ip that may call /update>   # required, else EVERY request gets 403
PORT=3000                               # default 3000
HOSTNAME=0.0.0.0                        # bind address (default 0.0.0.0)
```
- `DOMAIN` and `HOST` (set in `example.env` and `compose.yaml`) are **not read by the code**; the code wants `HOSTNAME`, not `HOST`. The domain comes from the `?domain=` query param, not from env.
- `.env` is in `.gitignore`; copy `example.env` to `.env` and rename `HOST` → `HOSTNAME`, add `PORT` if non-default.
- Every var defaults to `""`: the server **starts fine without `.env`** and answers 403 to everything. Don't expect a crash as a config signal.
- In Docker `HOSTNAME` is auto-set to the container hostname, so the server binds to that resolved address instead of the `0.0.0.0` default.
- `ALLOWED_IP` compares against the **direct TCP peer** (`info.remoteAddr.hostname`), no `X-Forwarded-For`. Behind a proxy / published Docker port the peer is the proxy or docker gateway IP, not the Fritzbox.

## Architecture
- `main.ts` — exports `createHandler(config)` returning the async HTTP handler; dotenv import, `@logtape/logtape` setup and `Deno.serve` only run under `if (import.meta.main)`, so tests can import the handler without starting a server. `config.updateDns` is injectable for tests (defaults to `updateNetcupDns`). Only `/update?ip=<ip>&domain=<domain>` exists, everything else 404.
- `utils.ts` — `getRemoteAddress()`, `updateNetcupDns()`, `updateIpInDnsRecord()` (hardcodes the record `hostname === "@" && type === "A"`; mutates and returns it).
- `netcup_api.ts` — all calls are `POST` to one URL `https://ccp.netcup.net/run/webservice/servers/endpoint.php?JSON` with `{action, param}` bodies. Session flow: `login` → `infoDnsRecords` → `updateDnsRecords` → `logout`. Success means HTTP 200 **and** body `statuscode === 2000` — NetCup also answers 200 on many failures.
- `interfaces.ts` — API types only.
- Errors are signalled as `false`/`null` + `console.error`; API layer swallows exceptions, so real causes are only in the console.
- `updateNetcupDns` closes the API session in a `finally` whenever login succeeded — logout runs on every failure path too. A failed logout is best-effort cleanup: it is only logged and never turns a successful update into `false`.

## Bug history (fixed)
- `main.ts` used to call `if (!updateNetcupDns(...))` **without `await`** → the Promise is always truthy → the endpoint replied `200 Ok` even when login/update failed. Fixed: the handler now `await`s and answers 500 on failure. Regression tests: `main_test.ts` "handler - returns 500 when the DNS update fails" and "...uses the real update flow by default".
- `updateNetcupDns` used to skip `logout` on the info/match/update failure paths, leaking the API session until NetCup times it out. Fixed with try/finally; logout failure no longer fails an applied update. Regression tests: the "returns false when ..." paths in `utils_test.ts` assert the `logout` call, "returns true when only the logout fails" pins the best-effort semantics.

## Logging
`@logtape/logtape`, configured in `main.ts`. Category `netcup-dns-updater` at `debug` (includes API call details), plus the `logtape/meta` logger at `warning`. `console.error` calls in `utils.ts` / `netcup_api.ts` are legacy and bypass this.

## Testing / deploy
```bash
deno task test      # unit/integration tests; fetch is stubbed, no network/.env needed
deno task start &   # needs .env with ALLOWED_IP=127.0.0.1 for local curl
curl "http://127.0.0.1:3000/update?ip=1.2.3.4&domain=example.com"   # 403 = allowlist mismatch, 400 = missing params, 404 = bad path, 500 = NetCup call failed
```
`docker compose up` uses `Dockerfile` (denoland/deno:latest, `USER deno`, `deno cache main.ts`, `restart: unless-stopped`) and passes env from the host shell / `.env`.

## Fritzbox
Internet → Freigaben → DynDns, URL `http://<server-ip>:<server-port>/update?ip=<ipaddr>&domain=<domain>` (the Fritzbox fills `<ipaddr>`/`<domain>`). See README.
