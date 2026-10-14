# NetCup DNS Updater - Product Requirements Document

## 1. Overview

**Project Name:** NetCup DNS Updater  
**Project Type:** Go Web Server  
**Core Functionality:** Automatically updates netcup DNS A-records with the current public IP of a FritzBox router  
**Target Users:** Home network administrators with netcup DNS and FritzBox routers

## 2. Goals

- Provide a simple HTTP endpoint that FritzBox can call for DynDNS updates
- Update netcup DNS A-record (apex/@) with new IP address
- Restrict access to authorized clients only (FritzBox IP)
- Run as a lightweight Docker container or standalone binary

## 3. User Stories

| # | Story | Acceptance Criteria |
|---|-------|---------------------|
| 1 | Als Benutzer möchte ich den Server via Docker starten | Docker Compose funktioniert mit Umgebungsvariablen |
| 2 | Als FritzBox möchte ich die DNS-Records automatisch aktualisieren | GET /update wird vom Server akzeptiert und verarbeitet |
| 3 | Als Benutzer möchte ich nur autorisierten Clients Zugriff gewähren | Requests von nicht-erlaubten IPs werden mit 403 abgelehnt |
| 4 | Als Benutzer möchte ich Fehlermeldungen im JSON-Format sehen | Logging erfolgt strukturiert mit slog |

## 4. Functional Requirements

### 4.1 API Endpoint

```
GET /update?ip=<ipaddr>&domain=<domain>
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ip` | string | Yes | New IP address to set |
| `domain` | string | Yes | Domain to update (e.g., example.com) |

**Responses:**
| Status | Body | Condition |
|--------|------|-----------|
| 200 | `Ok` | Update successful |
| 400 | `Missing IP parameter` | `ip` is empty or missing |
| 400 | `Missing domain parameter` | `domain` is empty or missing |
| 403 | `Forbidden` | Client IP not in `ALLOWED_IP` |
| 404 | - | Path is neither `/update` nor `/health` |
| 405 | - | HTTP method is not GET |
| 500 | `Internal server error` | Netcup API call failed |

### 4.2 Health Check

```
GET /health
```

Responds `200 OK` with body `Ok`. Not restricted by `ALLOWED_IP` so Docker health checks from inside the container always work.

### 4.3 Configuration

All configuration via environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NETCUP_API_KEY` | Yes | - | Netcup API key |
| `NETCUP_API_PASSWORD` | Yes | - | Netcup API password |
| `NETCUP_CUSTOMER_NUMBER` | Yes | - | Netcup customer number |
| `PORT` | No | 3000 | Server port |
| `HOSTNAME` | No | 0.0.0.0 | Server bind address |
| `ALLOWED_IP` | No | "" | Allowed client IP (FritzBox) |

The server exits at startup with an error if any required variable is missing.

### 4.4 Netcup API Flow

1. Login with API credentials → get `apisessionid`
2. Fetch DNS records for domain → find A-record with hostname `@`
3. Update A-record destination with new IP
4. Logout to close session

## 5. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Binary Size | < 10 MB |
| Memory Usage | < 50 MB |
| Startup Time | < 2 seconds |
| Availability | Docker container, auto-restart |
| Logging | Structured JSON (slog) |

## 6. Technical Stack

| Component | Choice | Rationale |
|-----------|--------|----------|
| Language | Go 1.21+ | Binary deployment, built-in slog |
| HTTP Framework | net/http | No external dependency |
| Logging | log/slog | Built-in, structured |
| Container | Alpine + Multi-stage | Small image |

## 7. Deployment

### Docker Compose

```yaml
services:
  server:
    build: .
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "-", "http://127.0.0.1:3000/health"]
      interval: 30s
      timeout: 3s
      retries: 3
    ports:
      - 3000:3000
    environment:
      - NETCUP_API_KEY=${NETCUP_API_KEY}
      - NETCUP_API_PASSWORD=${NETCUP_API_PASSWORD}
      - NETCUP_CUSTOMER_NUMBER=${NETCUP_CUSTOMER_NUMBER}
      - ALLOWED_IP=${ALLOWED_IP}
```

### FritzBox Configuration

1. Login to FritzBox → Internet → Freigaben → DynDNS
2. Update URL: `http://<server-ip>:3000/update?ip=<ipaddr>&domain=<your-domain>`
3. Domain: `<your-domain>`

## 8. File Structure

```
.
├── main.go          # Entry point, graceful shutdown
├── api.go           # HTTP handler
├── client.go        # Netcup API client
├── types.go         # Request/Response types + errors
├── config.go        # Environment config
├── Dockerfile       # Multi-stage build
├── compose.yaml     # Docker Compose
├── example.env      # Env template
└── *_test.go        # Unit tests
```

## 9. Status / Ehemalige TODOs

- [x] Add integration tests with mocked Netcup API (`integration_test.go`, mockable via `NewNetcupClientWithBaseURL`)
- [x] Add health check endpoint (`/health`, see 4.2)
- [x] Support multiple domains (domain is passed as query parameter)
- ~~Rate limiting~~ – not needed
- ~~TLS support~~ – not needed (plain HTTP in the LAN)
