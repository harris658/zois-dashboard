# ZOIS Dashboard

Stock management dashboard for ZOIS - tracks store inventory, online platform listings, and daily sales analytics.

**Live:** https://harris658.github.io/zois-dashboard/

---

## For Staff

### Install on phone
1. Open the link above in **Chrome** (Android) or **Safari** (iPhone)
2. Android: tap the browser menu → **Add to Home Screen**
3. iPhone: tap the Share button → **Add to Home Screen**
4. Done - the ZOIS Dashboard icon appears on your home screen

### Install on PC
1. Open the link above in **Chrome** or **Edge**
2. Look for the install icon (⊕) in the address bar → click it
3. Or just bookmark the link — it works the same way

### Updates
Nothing to do. When a new version is deployed, your app updates silently the next time you open it.

---

## For Developers

### Project structure

```
stock-dashboard.html    ← source HTML (references css/ and js/)
css/                    ← 13 CSS files
js/                     ← 12 JS files
images/logo.png         ← ZOIS logo
sw.js                   ← service worker source
build-standalone.py     ← build script (produces dist/)
data/                   ← optional: central stock feed (store.xlsx / online.xlsx)
tests/                  ← Python build tests + Node JS unit tests
.github/workflows/      ← CI/CD deploy workflow
```

### Updating the stock data (central feed)

One person updates the Excel — every installed app picks it up automatically on next open.

**From the main PC (recommended):** double-click `tools\publish-data.bat`. One-time setup:
open it in Notepad and set `STOCK_FILE` to wherever the stock Excel lives on that PC
(same idea as `start-image-server.bat`). The PC needs git installed, this repo cloned,
and a GitHub login — after that, publishing is a double-click.

**Manually, from any clone:**

```bash
# from inside this folder
mkdir -p data
cp "/path/to/latest stock export.xlsx" data/store.xlsx   # and/or data/online.xlsx
git add data/
git commit -m "data: stock update"
git push
```

Accepted names: `data/store.xlsx|.xls|.csv` and `data/online.xlsx|.xls|.csv`. The build
publishes them with a version manifest (`dist/data/feed.json`); on open the app downloads
any new version and loads it exactly like a manual upload. Rules:

- A file **linked on disk** (Profile tab → Link file) always wins — the feed never overrides it
- Offline → the app falls back to its saved IndexedDB copy as before
- Manual uploads still work and are kept until the *next* feed version is published
- The sync chip in the header shows when the feed data was published, not when the device loaded it
- **Images are NOT part of the feed** — the folder is too large for GitHub Pages. Staff load
  images from the LAN image server (`tools/start-image-server.bat` on the main PC) as before

⚠️ Note: this repo and its GitHub Pages site are **public**. Anything committed to `data/`
is reachable by anyone with the URL. Stock counts and product codes only — no pricing
secrets — but keep that in mind before committing.

### Making changes

Edit files in `css/` or `js/` as normal. When ready to deploy:

```bash
git add <changed files>
git commit -m "fix: description of change"
git push
```

GitHub Actions builds the app and deploys it automatically in ~60 seconds. Staff get the update silently on next open — no action needed from them.

### Running locally

Open `stock-dashboard.html` directly in a browser. It loads `css/` and `js/` files via relative paths, so no server needed for development.

### Building manually

Requires Python 3 and Pillow:

```bash
pip install Pillow
python3 build-standalone.py
```

This produces a `dist/` folder with the full PWA (inlined HTML, manifest, service worker, icons). The `dist/` folder is not committed — it's generated fresh by CI on every push.

### Running tests

```bash
pip install pytest Pillow
pytest tests/ -v                  # build output + data feed publishing
node --test tests/js/*.test.mjs   # parser, grouping, and feed logic unit tests
```

Both suites run in CI before every deploy — a failing test blocks the deployment, so a
broken build can never reach staff. The Python tests verify the build output (files,
manifest, icons, feed.json); the Node tests load the real `js/` sources into a stub DOM
and unit-test `processRows`, `processRowsLong`, `extractBaseCode`, `groupOnlineRows`, and
`checkRemoteFeed`.

---

## Recent updates

### Store stock — apparel-only filter
Store stock now only shows items that have at least one of S / M / L / XL / XXL / XXXL in stock. Items imported from Ginesys with non-standard sizes (waist measurements, numeric sizes, etc.) are excluded automatically at parse time. The size filter dropdown and all unit counts only reflect these standard sizes.

### Sort button on store and online grids
Both the store and online stock grids have a sort button (↕) at the right end of the filter bar.

**Store sort options:**
- Units in stock — High to Low / Low to High
- Price — High to Low / Low to High
- Product code — A to Z

**Online sort options:**
- Product code — A to Z / Z to A

Sort works standalone (no filter required) or combined with any active filter. An indicator dot on the button shows when a sort is active. Clicking the active option again clears it. The Clear button also resets the sort.

---

## How it works

The source files are kept modular (separate CSS and JS files) for easy editing. A Python build script inlines everything into a single `dist/index.html` and adds the PWA assets needed for installation:

- **`dist/manifest.json`** — tells the browser the app name, icon, and display mode
- **`dist/sw.js`** — service worker that caches the app shell for offline use and auto-updates on new deploys
- **`dist/icons/`** — app icons (192×192 and 512×512) resized from the ZOIS logo

Each deploy generates a unique cache version based on a hash of `index.html`, so the browser always detects and installs the new version automatically.
