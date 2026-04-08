FROM alpine:3.21 AS base

ARG S5CMD_VERSION=2.3.0
ARG TARGETARCH

# Map Docker TARGETARCH to s5cmd release naming
# amd64 -> Linux-64bit, arm64 -> Linux-arm64
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) S5CMD_ARCH="Linux-64bit" ;; \
      arm64) S5CMD_ARCH="Linux-arm64" ;; \
      *) echo "Unsupported arch: $TARGETARCH" && exit 1 ;; \
    esac; \
    wget -q "https://github.com/peak/s5cmd/releases/download/v${S5CMD_VERSION}/s5cmd_checksums.txt" \
         -O /tmp/checksums.txt; \
    wget -q "https://github.com/peak/s5cmd/releases/download/v${S5CMD_VERSION}/s5cmd_${S5CMD_VERSION}_${S5CMD_ARCH}.tar.gz" \
         -O "/tmp/s5cmd_${S5CMD_VERSION}_${S5CMD_ARCH}.tar.gz"; \
    cd /tmp && grep "${S5CMD_ARCH}.tar.gz" checksums.txt | sha256sum -c -; \
    tar xz -C /usr/local/bin -f "/tmp/s5cmd_${S5CMD_VERSION}_${S5CMD_ARCH}.tar.gz" s5cmd; \
    chmod +x /usr/local/bin/s5cmd; \
    rm /tmp/checksums.txt "/tmp/s5cmd_${S5CMD_VERSION}_${S5CMD_ARCH}.tar.gz"

# Non-root user for security
RUN adduser -D -u 1001 syncer
USER 1001
