# Build: docker build -t mesh-sandbox:local packages/mesh-plugin-user-sandbox/image
FROM node:22-bookworm-slim

# `locales` + generated `en_US.UTF-8` is load-bearing: repos using
# `embedded-postgres` refuse to init without it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       bash \
       ca-certificates \
       curl \
       git \
       locales \
       python3 \
       ripgrep \
       unzip \
  && sed -i 's/^#\s*en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen \
  && locale-gen \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local/bun bash \
  && ln -s /usr/local/bun/bin/bun /usr/local/bin/bun \
  && ln -s /usr/local/bun/bin/bun /usr/local/bin/bunx \
  && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/opt/deno sh -s -- -y \
  && ln -s /opt/deno/bin/deno /usr/local/bin/deno \
  && corepack enable \
  && corepack prepare yarn@stable --activate \
  && corepack prepare pnpm@latest --activate

ENV LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8

WORKDIR /app
COPY daemon.mjs /opt/sandbox-daemon/daemon.mjs
COPY daemon/ /opt/sandbox-daemon/daemon/

# Tells claude-code --permission-mode bypassPermissions to accept root PID 1;
# the container is the isolation boundary.
ENV IS_SANDBOX=1

EXPOSE 9000
CMD ["node", "/opt/sandbox-daemon/daemon.mjs"]
