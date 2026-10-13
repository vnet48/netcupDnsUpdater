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
