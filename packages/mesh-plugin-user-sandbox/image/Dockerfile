# Minimal sandbox image for mesh-plugin-user-sandbox.
# Build: docker build -t mesh-sandbox:local packages/mesh-plugin-user-sandbox/image
FROM node:22-bookworm-slim

# Runtime deps + bun. We install bun because dev servers bootstrap with it by
# default (Deco CLI and new projects); npm stays available via node, so users
# can still run npm/pnpm/yarn projects through scripts.dev.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       bash \
       ca-certificates \
       curl \
       git \
       python3 \
       ripgrep \
       unzip \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local/bun bash \
  && ln -s /usr/local/bun/bin/bun /usr/local/bin/bun \
  && ln -s /usr/local/bun/bin/bun /usr/local/bin/bunx \
  && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/opt/deno sh -s -- -y \
  && ln -s /opt/deno/bin/deno /usr/local/bin/deno

WORKDIR /app
COPY daemon.mjs /opt/sandbox-daemon/daemon.mjs

EXPOSE 9000
CMD ["node", "/opt/sandbox-daemon/daemon.mjs"]
