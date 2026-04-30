#!/usr/bin/env python3
"""Download a file from org storage onto the sandbox filesystem.

Accepts three input shapes:
  1. https://…           — fetched directly
  2. mesh-storage://KEY  — resolved via mesh /api/sandbox/user-data/get
  3. bare KEY            — resolved via mesh /api/sandbox/user-data/get

Doesn't depend on the tool-arg substitution interceptor — works whether
or not the URI was rewritten before reaching the sandbox.
"""

import argparse
import os
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request


# The canonical scheme is `mesh-storage://` (see
# apps/mesh/src/api/routes/decopilot/mesh-storage-uri.ts). The single-colon
# form is accepted as a forgiving fallback in case anything ever produces it.
MESH_STORAGE_SCHEMES = ("mesh-storage://", "mesh-storage:")


def _strip_scheme(s: str) -> str:
    for scheme in MESH_STORAGE_SCHEMES:
        if s.startswith(scheme):
            return s[len(scheme) :]
    return s


def _resolve(input_str: str) -> tuple[str, bool]:
    """Return (url, needs_bearer). For direct URLs no bearer is added."""
    if input_str.startswith(("https://", "http://")):
        return input_str, False

    key = _strip_scheme(input_str)
    if not key or key.startswith("/") or ".." in key:
        print(f"invalid key: {key!r}", file=sys.stderr)
        raise SystemExit(2)

    mesh_url = os.environ.get("MESH_URL")
    if not mesh_url:
        print("MESH_URL must be set in env", file=sys.stderr)
        raise SystemExit(2)
    qs = urllib.parse.urlencode({"key": key})
    return f"{mesh_url.rstrip('/')}/api/sandbox/user-data/get?{qs}", True


def _basename_from_key(input_str: str) -> str:
    if input_str.startswith(("http://", "https://")):
        path = urllib.parse.urlparse(input_str).path
        return os.path.basename(path) or "download.bin"
    return os.path.basename(_strip_scheme(input_str)) or "download.bin"


# urllib's default redirect handler follows 3xx but does NOT strip the
# Authorization header on cross-origin redirects (unlike `requests`). When
# mesh /get returns 302 → presigned S3 URL, sending the Bearer along makes
# S3 reject the request as a malformed AWS-signed call. Suppress auto-follow
# and handle the redirect explicitly below.
class _NoFollowRedirect(urllib.request.HTTPRedirectHandler):
    def http_error_301(self, req, fp, code, msg, headers):  # noqa: ARG002
        return None

    http_error_302 = http_error_301
    http_error_303 = http_error_301
    http_error_307 = http_error_301
    http_error_308 = http_error_301


def _download(url: str, needs_bearer: bool, out_path: str) -> None:
    headers: dict[str, str] = {}
    if needs_bearer:
        token = os.environ.get("DAEMON_TOKEN", "")
        if not token:
            print("DAEMON_TOKEN must be set in env", file=sys.stderr)
            raise SystemExit(2)
        headers["Authorization"] = f"Bearer {token}"

    opener = urllib.request.build_opener(_NoFollowRedirect)
    req = urllib.request.Request(url, headers=headers)

    try:
        resp = opener.open(req)
    except urllib.error.HTTPError as e:
        # Non-following redirect handler returns None → urllib raises
        # HTTPError with the 3xx code and Location header intact.
        if e.code in (301, 302, 303, 307, 308):
            location = e.headers.get("Location")
            if not location:
                print(
                    f"redirect {e.code} without Location header",
                    file=sys.stderr,
                )
                raise SystemExit(1) from None
            try:
                # Second hop: no Authorization. Presigned URLs carry their
                # own signature in the query string.
                with (
                    urllib.request.urlopen(location) as r2,
                    open(out_path, "wb") as f,
                ):
                    shutil.copyfileobj(r2, f)
                return
            except urllib.error.HTTPError as e2:
                msg = e2.read().decode("utf-8", errors="replace")
                print(f"download failed: HTTP {e2.code} {msg}", file=sys.stderr)
                raise SystemExit(1) from None
        msg = e.read().decode("utf-8", errors="replace")
        print(f"download failed: HTTP {e.code} {msg}", file=sys.stderr)
        raise SystemExit(1) from None

    with resp, open(out_path, "wb") as f:
        shutil.copyfileobj(resp, f)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Download an org-scoped file into the sandbox."
    )
    parser.add_argument(
        "input",
        help="URL, mesh-storage://KEY, or bare object key",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Target path (default: /home/sandbox/<basename>)",
    )
    args = parser.parse_args(argv)

    out = args.out or os.path.join("/home/sandbox", _basename_from_key(args.input))
    url, needs_bearer = _resolve(args.input)
    _download(url, needs_bearer, out)
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
