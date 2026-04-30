#!/usr/bin/env python3
"""Share a file or directory back to the user via the chat UI.

Uploads to org storage under model-outputs/<thread_id>/<filename>; the
chat UI lists this prefix and renders a download chip on the assistant
turn. Directories are gzip-tarred client-side and uploaded as
<dirname>.tar.gz.

Reads MESH_URL and DAEMON_TOKEN from env. 100 MB cap.
"""

import argparse
import io
import mimetypes
import os
import sys
import tarfile
import urllib.error
import urllib.parse
import urllib.request


MAX_BYTES = 100 * 1024 * 1024  # mirrors server-side cap


def _tar_gz_dir(path: str) -> tuple[bytes, str]:
    """Return (gzip-tar bytes, suggested filename) for a directory."""
    buf = io.BytesIO()
    arcname = os.path.basename(os.path.normpath(path))
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        tar.add(path, arcname=arcname)
    return buf.getvalue(), f"{arcname}.tar.gz"


def _read_file(path: str) -> tuple[bytes, str]:
    with open(path, "rb") as f:
        data = f.read()
    return data, os.path.basename(path)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Share a file or directory back to the chat user."
    )
    parser.add_argument("path", help="File or directory to share")
    parser.add_argument(
        "--name",
        default=None,
        help="Override the uploaded filename (default: basename of path)",
    )
    args = parser.parse_args(argv)

    if not os.path.exists(args.path):
        print(f"path not found: {args.path}", file=sys.stderr)
        return 2

    if os.path.isdir(args.path):
        body, default_name = _tar_gz_dir(args.path)
    else:
        body, default_name = _read_file(args.path)

    filename = args.name or default_name

    if len(body) > MAX_BYTES:
        size_mb = len(body) / (1024 * 1024)
        print(
            f"file too large ({size_mb:.1f} MB > 100 MB cap)",
            file=sys.stderr,
        )
        return 1

    mesh_url = os.environ.get("MESH_URL")
    token = os.environ.get("DAEMON_TOKEN")
    if not mesh_url or not token:
        print("MESH_URL and DAEMON_TOKEN must be set in env", file=sys.stderr)
        return 2

    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    url = f"{mesh_url.rstrip('/')}/api/sandbox/user-data/share"
    req = urllib.request.Request(
        url,
        method="POST",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "X-Filename": filename,
            "Content-Type": content_type,
            "Content-Length": str(len(body)),
        },
    )

    try:
        with urllib.request.urlopen(req) as resp:
            payload = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", errors="replace")
        print(f"share failed: HTTP {e.code} {msg}", file=sys.stderr)
        return 1

    # Server returns { key, downloadUrl }. Print the URL so the model
    # can mention it in the reply, and the key on stderr for debug.
    import json

    parsed = json.loads(payload)
    print(parsed["downloadUrl"])
    print(f"key={parsed['key']}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
