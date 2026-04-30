# user-data — org-scoped file access

Read-only access to files stored in the org's object storage. Use this to
list files and download them onto the sandbox filesystem so the other
skills (pptx, docx, pdf, ...) can act on them.

## Quick reference

| Task                                  | Command                                              |
| ------------------------------------- | ---------------------------------------------------- |
| List all files                        | `user-data-list`                                     |
| List a prefix                         | `user-data-list chat-uploads/`                       |
| Page through results                  | `user-data-list --page-token <token>`                |
| JSON output (for piping to `jq`)      | `user-data-list --json`                              |
| Download by stable URI                | `user-data-download mesh-storage://chat-uploads/x.pdf` |
| Download by bare key                  | `user-data-download chat-uploads/x.pdf`              |
| Download from a presigned URL         | `user-data-download "https://..."`                   |
| Override save path                    | `user-data-download <input> --out /tmp/x.pdf`        |
| Share a file back to the user         | `user-data-share /home/sandbox/report.csv`           |
| Share a directory (gzip-tarred)       | `user-data-share /home/sandbox/build/`               |
| Override uploaded filename            | `user-data-share <path> --name custom.zip`           |

## File layout

The org's bucket holds files under several known prefixes:

- `chat-uploads/` — files the user attached in chat
- `screenshots/` — screenshots taken by the model in earlier turns
- `generated-images/` — images the model generated previously
- `inspect-pages/` — large page-inspection results
- `scraped-pages/` — large scrape results
- `web-search/` — large web-search results

`user-data-list` with no prefix lists everything; pass a prefix to narrow.

## Listing

`user-data-list [prefix] [--page-token TOKEN] [--limit N] [--json]`

Default output is a human table (key, size, uploadedAt). When the result is
truncated, the next-page token is printed on stderr — pass it back via
`--page-token`. `--limit` caps to 200 (server max).

## Downloading

`user-data-download <input> [--out PATH]`

Accepts three input shapes:

1. `https://…` / `http://…` — fetched directly (e.g. a presigned URL the
   model already has).
2. `mesh-storage://KEY` — the stable URI shape you'll see in chat
   annotations like `[Uploaded files] - foo.pdf: mesh-storage://chat-uploads/abc.pdf`.
3. A bare `KEY` like `chat-uploads/abc.pdf`.

Defaults the save path to `/home/sandbox/<basename>`. Prints the final
path on stdout — pipe straight into another skill:

```sh
pptx-extract "$(user-data-download mesh-storage://chat-uploads/deck.pptx)"
```

## Sharing back to the user

`user-data-share <path> [--name NAME]`

Uploads a file (or directory, gzip-tarred) to org storage under a
thread-scoped prefix; the chat UI renders a download chip on the
assistant turn so the user can grab it. 100 MB cap.

- File path → uploaded as-is, key = `model-outputs/<thread_id>/<basename>`.
- Directory path → tarred to `<dirname>.tar.gz` first.
- `--name` overrides the uploaded filename.

Prints the resulting download URL on stdout — include it in the reply
so the user knows what was produced. Only works in chat-thread
sandboxes (not standalone agent sandboxes).

## Environment

All commands read `MESH_URL` and `DAEMON_TOKEN` from env. These are
injected at sandbox provision time — you don't need to set them.
