# ---- Build stage ----
FROM oven/bun:1-slim AS build

WORKDIR /app

# Install dependencies (re-run only when package.json/bun.lock change).
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Compile the app into a single static executable (re-run on source changes).
COPY *.ts ./
ARG TARGETARCH
RUN arch=x64; [ "$TARGETARCH" = "arm64" ] && arch=arm64; \
    bun build --compile --format=esm --minify --sourcemap --bytecode \
    --target=bun-linux-$arch-musl main.ts --outfile /out/netcup-dns-updater

# ---- Runtime stage ----
# musl base, matches the musl build from the builder stage.
FROM alpine:3.21

# The bun-linux-*-musl build is not fully static: it dynamically links
# libstdc++ and libgcc, which the bare alpine image does not ship.
# Without this the container loops on "Error loading shared library
# libstdc++.so.6 ... symbol not found". (Bun's own release CI smoke-tests
# its musl binaries on Alpine the same way.)
RUN apk add --no-cache libstdc++ libgcc

# Prefer not to run as root.
RUN adduser -D -H -u 10001 app
USER app

COPY --from=build /out/netcup-dns-updater /usr/local/bin/netcup-dns-updater

# The port that your application listens to.
EXPOSE 3000

ENTRYPOINT ["netcup-dns-updater"]
