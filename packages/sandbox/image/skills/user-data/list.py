#!/usr/bin/env python3
"""List org-scoped files via the mesh user-data endpoint."""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def _fetch(mesh_url: str, token: str, query: dict[str, str]) -> dict:
    qs = urllib.parse.urlencode({k: v for k, v in query.items() if v})
    url = f"{mesh_url.rstrip('/')}/api/sandbox/user-data/list?{qs}"
    req = urllib.request.Request(
        url, headers={"Authorization": f"Bearer {token}"}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", errors="replace")
        print(f"list failed: HTTP {e.code} {msg}", file=sys.stderr)
        raise SystemExit(1)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="List files in the org's storage."
    )
    parser.add_argument("prefix", nargs="?", default="", help="Optional prefix")
    parser.add_argument("--page-token", default="", help="Continuation token")
    parser.add_argument("--limit", type=int, default=100, help="Max items (≤200)")
    parser.add_argument("--json", action="store_true", help="Print raw JSON")
    args = parser.parse_args(argv)

    mesh_url = os.environ.get("MESH_URL")
    token = os.environ.get("DAEMON_TOKEN")
    if not mesh_url or not token:
        print("MESH_URL and DAEMON_TOKEN must be set in env", file=sys.stderr)
        return 2

    body = _fetch(
        mesh_url,
        token,
        {
            "prefix": args.prefix,
            "continuationToken": args.page_token,
            "maxKeys": str(args.limit),
        },
    )

    if args.json:
        print(json.dumps(body, indent=2))
        return 0

    objects = body.get("objects", [])
    if not objects:
        print("(no files)")
    else:
        # Compact human table; the model picks a key and feeds it to download.
        widest_key = max(len(o["key"]) for o in objects)
        for o in objects:
            size = o.get("size", 0)
            uploaded = o.get("uploadedAt", "")
            print(f"{o['key']:<{widest_key}}  {size:>10}  {uploaded}")

    if body.get("isTruncated"):
        token = body.get("nextContinuationToken", "")
        print(
            f"(truncated; pass --page-token {token} for next page)",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
