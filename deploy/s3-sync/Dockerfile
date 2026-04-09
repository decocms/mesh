FROM alpine:3.21

RUN apk add --no-cache curl inotify-tools

# Non-root user for security
RUN adduser -D -u 1001 syncer
USER 1001
