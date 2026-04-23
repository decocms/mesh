# Build: docker build -t mesh-sandbox:local packages/mesh-plugin-user-sandbox/image
FROM node:22-bookworm-slim

# Bun/Deno versions pinned so a bun.sh / deno.land rebuild can't silently
# swap what we ship. Bump intentionally, not by latest-tag drift.
ARG BUN_VERSION=bun-v1.1.42
ARG DENO_VERSION=v1.46.3

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
  && curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local/bun bash -s "${BUN_VERSION}" \
  && ln -s /usr/local/bun/bin/bun /usr/local/bin/bun \
  && ln -s /usr/local/bun/bin/bun /usr/local/bin/bunx \
  && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/opt/deno sh -s -- -y "${DENO_VERSION}" \
  && ln -s /opt/deno/bin/deno /usr/local/bin/deno \
  && corepack enable \
  && corepack prepare yarn@stable --activate \
  && corepack prepare pnpm@latest --activate

ENV LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8

# Non-root sandbox user. Container root was the historical isolation
# boundary, but dropping privileges cuts the blast radius of any future
# CVE in node/git/ripgrep. Runtime further drops caps via docker-run flags.
RUN userdel --remove node \
  && useradd --create-home --uid 1000 --user-group --shell /bin/bash sandbox \
  && mkdir -p /app /opt/sandbox-daemon \
  && chown -R sandbox:sandbox /app /opt/sandbox-daemon

WORKDIR /app
COPY --chown=sandbox:sandbox daemon.mjs /opt/sandbox-daemon/daemon.mjs
COPY --chown=sandbox:sandbox daemon/ /opt/sandbox-daemon/daemon/

# Flag claude-code honors to accept a non-interactive permission mode.
# Orthogonal to the root/non-root posture; kept for tooling compatibility.
ENV IS_SANDBOX=1

USER sandbox

EXPOSE 9000
CMD ["node", "/opt/sandbox-daemon/daemon.mjs"]
