# Go-Migration Plan

## Entscheidungen

| Aspekt | Entscheidung |
|--------|-------------|
| Verzeichnisstruktur | **A - Flach**: `main.go`, `api.go`, `client.go`, `types.go`, `config.go` |
| HTTP-Framework | `net/http` (Standard Library) |
| Logging | `log/slog` (JSON-Output, Go 1.21+ built-in) |
| Config | Environment Variables via `os.LookupEnv` |
| Error Handling | Custom Error Types |
| Docker | Ja, Go-Multi-Stage-Build |
| Tests | Ja, mit `testing`-Package |
| API-Kompatibilität | `GET /update?ip=<ipaddr>&domain=<domain>` |

## Dateien

```
netcupDnsUpdater/
├── main.go        # Entry point, Server startup
├── api.go         # HTTP handler /update endpoint
├── client.go      # Netcup API client
├── types.go       # Request/Response structs + custom errors
├── config.go      # Environment variables
├── go.mod
├── go.sum
├── Dockerfile
└── compose.yaml
```

## Ablauf

1. `go mod init` - Projekt initialisieren
2. `config.go` - Env vars laden, Config struct
3. `types.go` - API types + custom error types
4. `client.go` - Netcup API calls (login, logout, infoDns, updateDns)
5. `api.go` - HTTP handler mit `net/http`
6. `main.go` - `slog` setup, `http.ListenAndServe`
7. `Dockerfile` - Go Multi-Stage Build
8. `compose.yaml` - aktualisieren
9. Tests schreiben

## Custom Error Types

```go
type NetcupError struct {
    Code    int
    Message string
}

func (e *NetcupError) Error() string {
    return e.Message
}

// Error codes
const (
    ErrLoginFailed       = 1001
    ErrLogoutFailed      = 1002
    ErrGetDnsRecords     = 1003
    ErrUpdateDnsRecord   = 1004
    ErrMissingIP         = 2001
    ErrMissingDomain     = 2002
    ErrForbidden         = 2003
)
```

## Config Struct

```go
type Config struct {
    APIKey          string
    APIPassword     string
    CustomerNumber  string
    Port            string
    Hostname        string
    AllowedIP       string
}
```

## API Response

| Status | Bedeutung |
|--------|----------|
| 200 | Update erfolgreich |
| 400 | Fehlende Parameter |
| 403 | IP nicht erlaubt |
| 404 | Pfad nicht gefunden |
| 500 | Interner Fehler |
