# Minimal sandbox image for mesh-plugin-user-sandbox.
# Build: docker build -t mesh-sandbox:local packages/mesh-plugin-user-sandbox/image
FROM node:22-bookworm-slim

# Runtime deps + bun + deno. Claude Code is NOT in this image — use
# Dockerfile.claude for the claude-enabled variant. The daemon still has a
# lazy-install fallback (also bun-based) for unusual paths.
# `locales` + a generated `en_US.UTF-8` are load-bearing: repos that use
# `embedded-postgres` (decocms/studio dev server, any app running mesh
# in-sandbox) refuse to init without it. Matches the Freestyle VM_START
# install-ripgrep.sh so both runners have parity.
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
  && ln -s /opt/deno/bin/deno /usr/local/bin/deno

ENV LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8

WORKDIR /app
COPY daemon.mjs /opt/sandbox-daemon/daemon.mjs

# Tell claude-code it's running in a sandbox so --permission-mode
# bypassPermissions doesn't refuse because PID 1 is root. We ARE root in this
# container — that's fine; the container itself is the isolation boundary.
ENV IS_SANDBOX=1

EXPOSE 9000
CMD ["node", "/opt/sandbox-daemon/daemon.mjs"]
