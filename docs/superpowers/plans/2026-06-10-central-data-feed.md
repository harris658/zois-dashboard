# Central Excel Data Feed + CI Test Gate — Implementation Plan

**Goal:** One person updates the stock Excel and pushes — all 5 staff devices pick it up
automatically on next open. No per-device uploads. Images explicitly stay on the LAN
image server (folder too big for GitHub Pages); only Excel data is centrally published.

**Hard constraint:** Must not break any existing flow — manual upload, disk-linked files,
IDB restore, LAN image server all keep working exactly as before. The feed is additive.

**Architecture:**

- `data/` folder in the repo holds `store.xlsx|.xls|.csv` and/or `online.xlsx|.xls|.csv`.
- `build-standalone.py` copies them to `dist/data/` and writes `dist/data/feed.json`
  with `{file, hash, updated}` per tab. No `data/` folder → no feed published (app is
  unaffected, fetch 404s silently).
- New `js/feed.js` — `checkRemoteFeed()` runs at the end of `initFromCache()`:
  1. fetch `./data/feed.json` (no-store); abort silently if offline/404
  2. per tab: skip if a disk-linked handle exists (linked file wins)
  3. skip if the published hash was already applied (`feed-<tab>-hash` in IDB)
  4. otherwise download, save to IDB (same shape as a manual upload), and load through
     the existing `_restoreStore` / `_restoreOnline` path
  5. set the sync chip to the feed's `updated` timestamp → "data as of" is visible
- CI gate: `pytest` + `node --test tests/js/` run before build/deploy in `deploy.yml` —
  a broken build can never reach staff.

**Tests:**

- `tests/test_feed.py` — build publishes `dist/data/` + valid `feed.json` (synthetic CSV,
  skipped if a real `data/` folder exists; never touches real data)
- `tests/js/parse.test.mjs` — first unit tests for the parser core: `processRows`,
  `processRowsLong` (wide + long format, qty coercion, code filtering)
- `tests/js/online.test.mjs` — `extractBaseCode`, `groupOnlineRows`
- `tests/js/feed.test.mjs` — feed applies new version, skips same hash, respects linked
  handle, silent on network failure
- JS files load unmodified into a `node:vm` context with a stub DOM (`tests/js/_context.mjs`)

**Out of scope:** publishing images (LAN server stays), automating the Excel drop
(possible later via n8n), making the repo private (flagged to Harshit — data on GitHub
Pages is publicly reachable).
