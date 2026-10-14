# AGENTS.md - NetCup DNS Updater

Single-package Go server. Zero external dependencies. Updates netcup DNS A-records via FritzBox DynDNS.

## Commands

```bash
# Build binary
go build -o server .

# Run
go run .

# Test everything
go test -v ./...

# Test one file
go test -v api_test.go api.go client.go types.go config.go

# Test one function
go test -v -run TestHandler_ServeHTTP

# Format + vet (do both before committing)
go fmt ./... && go vet ./...

# Docker
docker compose build && docker compose up
```

## Architecture

- **Single package** (`package main`), flat layout. No sub-packages.
- **Entry**: `main.go` wires logger → config → `NetcupClient` → `Handler` → `http.Server` with graceful shutdown.
- **Zero external deps**. Only stdlib: `net/http`, `log/slog`, `encoding/json`, `os`.
- **HTTP**: `Handler` implements `ServeHTTP`. Routes: `GET /update?ip=<ip>&domain=<domain>` and `GET /health` (always 200, no IP check).
- **Client**: `NetcupClient` orchestrates login → infoDnsRecords → updateDnsRecords → logout. Uses `defer logout()` after login. For integration tests, `NewNetcupClientWithBaseURL` injects a mocked API endpoint (`integration_test.go`).
- **Remote IP**: `getRemoteAddr()` uses `r.RemoteAddr` directly. Proxy headers (`X-Forwarded-For`) are deliberately not trusted — `ALLOWED_IP` always matches the direct caller.

## Netcup API Quirks

- Endpoint: `https://ccp.netcup.net/run/webservice/servers/endpoint.php?JSON`
- **Success status code is `2000`** (not HTTP 200). HTTP 200 just means the request reached the server.
- All calls are POST with JSON body. Action field determines operation: `login`, `logout`, `infoDnsRecords`, `updateDnsRecords`.
- The A-record to update is identified by `hostname == "@" && type == "A"`.
- Session management: login returns `apisessionid`; pass it to all subsequent calls; always logout (deferred).

## Error Handling

- Custom `NetcupError` with typed constants (`ErrLoginFailed = 1001`, etc.).
- Check with `errors.As(err, &netcupErr)`.
- API client methods wrap low-level errors with `fmt.Errorf("...: %w", err)` and return `NetcupError` for business-logic failures.

## Config

| Var | Required | Default |
|-----|----------|---------|
| `NETCUP_API_KEY` | yes | — |
| `NETCUP_API_PASSWORD` | yes | — |
| `NETCUP_CUSTOMER_NUMBER` | yes | — |
| `PORT` | no | `3000` |
| `HOSTNAME` | no | `0.0.0.0` |
| `ALLOWED_IP` | no | `""` (allow all) |

`LoadConfig()` returns an error when a required var is missing — the server exits at startup with a clear message.

## API Endpoints

- `GET /update?ip=<ipaddr>&domain=<domain>` — responses: `200` OK, `400` missing param, `403` IP not allowed, `404` unknown path, `405` non-GET, `500` update failed.
- `GET /health` — always `200` with body `Ok`, bypasses the `ALLOWED_IP` check (for Docker healthchecks).

## Style

- Go 1.26+ (see `go.mod`).
- `gofmt` defaults (tabs, not spaces).
- Use `log/slog` with structured key-value pairs: `logger.Info("msg", "key", value)`.
