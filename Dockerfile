FROM oven/bun:1-slim

# The port that your application listens to.
EXPOSE 3000

WORKDIR /app

# Prefer not to run as root.
USER bun

# Cache the dependencies as a layer (re-run only when package.json/bun.lock change).
COPY --chown=bun:bun package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# These steps will be re-run upon each file change in your working directory:
COPY --chown=bun:bun --recursive *.ts ./

CMD ["bun", "run", "main.ts"]
