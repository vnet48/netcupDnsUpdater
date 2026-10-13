# NetCupDnsUpdater

simple server (Bun/TypeScript) to update the netcup dns entry to the current IP
of the fritzbox.

fill in the dyndns settings in fritzbox (Internet ->
Freigaben -> DynDns) with

* url: `http://<server-ip>:<server-port>/update?ip=<ipaddr>&domain=<domain>`
* domain: `<your domain>`

## Development

copy `example.env` to `.env` (Bun loads it automatically), then

```bash
bun install
bun run dev     # watch mode
bun test        # fetch is stubbed, no network access or .env needed
bun run check   # type check (tsc --noEmit)
```

## Deploy

### Docker

```bash
cp example.env .env   # fill in your values
docker compose up -d --build
```

The image is built as a multi-stage Dockerfile: the app is compiled into a
single static (musl) executable and runs in a plain Alpine image — no Bun, no
`node_modules` in the final image.

### Single-file executable (without Docker)

```bash
bun run build:sfe   # -> dist/netcup-dns-updater-linux-x64
```

Copy the binary to your (glibc-based, e.g. Debian/Ubuntu) server and run it:

```bash
./netcup-dns-updater-linux-x64
```

It loads `.env` from the current working directory automatically, so place an
env file next to it or export `NETCUP_API_KEY`, `NETCUP_API_PASSWORD`,
`NETCUP_CUSTOMER_NUMBER` and `ALLOWED_IP` in the environment (e.g. via a
systemd unit). The binary is built for `bun-linux-x64` (glibc). For an
Alpine/musl host, change the `--target` in the script to
`bun-linux-x64-musl`.
