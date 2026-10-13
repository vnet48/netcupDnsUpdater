# NetCupDnsUpdater

simple server to update the netcup dns entry to the current IP of the fritzbox.

fill in the dyndns settings in fritzbox (Internet ->
Freigaben -> DynDns) with

* url: `http://<server-ip>:<server-port>/update?ip=<ipaddr>&domain=<domain>`
* domain: `<your domain>`

## Development

run the tests with `deno task test` (fetch is stubbed, no network access or
`.env` needed).
