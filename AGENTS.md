# AGENTS.md

## Cursor Cloud specific instructions

### What this is
Endless Frontier 2 Browser Runtime: a local Python (stdlib-only) HTTP/WebSocket server
that downloads the game's remote asset bundles, serves a browser bootstrap, and reverse-proxies
the publisher's API/WebSocket traffic so the game runs in a desktop browser. See `README.md`.

### Dependencies / environment
- Pure **Python 3.10+ standard library** — there is nothing to `pip install` (no
  `requirements.txt`/`package.json`). The update script is intentionally a no-op verification.
- The web frontend (`web/`, `index.js`) is served statically; there is no build step.
- There are no automated tests, linters, or CI configured in this repo.

### Running the server (the only in-repo service)
- Run from the repo root: `python3 scripts/run_server.py` (optional port arg, e.g. `python3 scripts/run_server.py 8080`).
  `run_server.bat` is the Windows equivalent and is not used on Linux.
- App URL: `http://localhost:8080/endlessfrontier2/` (port is `listenPort` in `config.json`).
- Binds `127.0.0.1` and (if available) `::1`. IPv6 is optional and disables gracefully.

### Non-obvious caveats
- On startup the server fetches `bundle.json` from the S3 CDN and downloads/merges the game
  asset ZIPs into `runtime/bundles/` (~130 MB, created at runtime, not committed). **Outbound
  internet is required**; without it `prepare_remote_bundle()` returns a `remote-unavailable`
  state and gameplay will not load. First startup downloads bundles (slower); later startups
  reuse the cached main/update bundles but always rebuild the merged bundle.
- Logs go to **stdout** and are only flushed when attached to a TTY. If you pipe output (e.g.
  `| tee`), Python buffers stdout and the file looks empty — run with `python3 -u`
  (or `PYTHONUNBUFFERED=1`) to see `[BUNDLE]`/`[SERVER]` logs when redirecting.
- Request/asset logging is off by default; toggle `logging.showRequestLogs` /
  `showAssetRequestLogs` in `config.json` for verbose HTTP logs.
- To force a clean re-download on `Checksum mismatch`, delete `runtime/bundles/` and restart.
- Actual gameplay login requires a real Google/Apple game account (Firebase/Google Identity,
  loaded in-browser); the local runtime cannot mock it.
