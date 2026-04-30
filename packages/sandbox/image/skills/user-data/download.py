#!/usr/bin/env python3
"""Download a file from org storage onto the sandbox filesystem.

Accepts three input shapes:
  1. https://…     — fetched directly
  2. mesh-storage:KEY — resolved via mesh /api/sandbox/user-data/get
  3. bare KEY      — resolved via mesh /api/sandbox/user-data/get

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


MESH_STORAGE_PREFIX = "mesh-storage:"


def _resolve(input_str: str) -> tuple[str, bool]:
    """Return (url, needs_bearer). For direct URLs no bearer is added."""
    if input_str.startswith(("https://", "http://")):
        return input_str, False

    key = (
        input_str[len(MESH_STORAGE_PREFIX) :]
        if input_str.startswith(MESH_STORAGE_PREFIX)
        else input_str
    )
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
    if input_str.startswith(MESH_STORAGE_PREFIX):
        input_str = input_str[len(MESH_STORAGE_PREFIX) :]
    if input_str.startswith(("http://", "https://")):
        path = urllib.parse.urlparse(input_str).path
        return os.path.basename(path) or "download.bin"
    return os.path.basename(input_str) or "download.bin"


def _download(url: str, needs_bearer: bool, out_path: str) -> None:
    """Fetch URL → out_path. urllib follows 302 to the S3 presigned URL and
    drops the Authorization header on cross-origin redirect (Python ≥3.0),
    which is what we want — S3 carries its own signature in the URL."""
    headers: dict[str, str] = {}
    if needs_bearer:
        token = os.environ.get("DAEMON_TOKEN", "")
        if not token:
            print("DAEMON_TOKEN must be set in env", file=sys.stderr)
            raise SystemExit(2)
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp, open(out_path, "wb") as f:
            shutil.copyfileobj(resp, f)
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", errors="replace")
        print(f"download failed: HTTP {e.code} {msg}", file=sys.stderr)
        raise SystemExit(1)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Download an org-scoped file into the sandbox."
    )
    parser.add_argument(
        "input",
        help="URL, mesh-storage:KEY, or bare object key",
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
