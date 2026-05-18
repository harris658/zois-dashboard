# ZOIS Dashboard PWA Distribution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the ZOIS stock dashboard into a PWA hosted on GitHub Pages so 5 staff members can install it on phone or PC from a single URL with silent automatic updates.

**Architecture:** The existing `build-standalone.py` is extended to produce a `dist/` folder (index.html + manifest.json + sw.js + icons/) instead of a single file. A GitHub Actions workflow runs the build on every push and deploys `dist/` to GitHub Pages. A service worker caches the app shell for offline use and silently updates in the background.

**Tech Stack:** Python 3, Pillow (icon resizing), pytest, GitHub Actions, GitHub Pages

---

## File Structure

**New files:**
- `sw.js` — service worker source (cache-first, background update)
- `tests/test_build.py` — build output verification tests
- `.github/workflows/deploy.yml` — CI/CD: build → deploy to GitHub Pages
- `.gitignore` — excludes `dist/` and `__pycache__/`

**Modified files:**
- `build-standalone.py` — extended to generate the full `dist/` PWA folder

**Generated (not committed, deployed by CI):**
- `dist/index.html`, `dist/manifest.json`, `dist/sw.js`, `dist/icons/icon-192.png`, `dist/icons/icon-512.png`

---

## Task 1: Write Failing Build Tests

**Files:**
- Create: `tests/__init__.py`
- Create: `tests/test_build.py`

- [ ] **Step 1: Install pytest and Pillow**

```bash
pip install pytest Pillow
```

Expected: both install without errors.

- [ ] **Step 2: Create the tests directory and empty init file**

```bash
mkdir -p tests && touch tests/__init__.py
```

- [ ] **Step 3: Write `tests/test_build.py`**

```python
import subprocess, json
from pathlib import Path
import pytest
from PIL import Image

ROOT = Path(__file__).parent.parent
DIST = ROOT / "dist"

@pytest.fixture(scope="module", autouse=True)
def build():
    result = subprocess.run(
        ["python3", str(ROOT / "build-standalone.py")],
        capture_output=True, text=True, cwd=ROOT
    )
    assert result.returncode == 0, f"Build failed:\n{result.stderr}"

def test_dist_folder_exists():
    assert DIST.is_dir()

def test_index_html_exists():
    assert (DIST / "index.html").exists()

def test_index_html_has_manifest_link():
    html = (DIST / "index.html").read_text()
    assert 'rel="manifest"' in html

def test_index_html_has_sw_registration():
    html = (DIST / "index.html").read_text()
    assert "serviceWorker" in html
    assert "sw.js" in html

def test_manifest_json_valid():
    manifest = json.loads((DIST / "manifest.json").read_text())
    assert manifest["name"] == "ZOIS Dashboard"
    assert manifest["display"] == "standalone"
    assert manifest["theme_color"] == "#5a2c0a"
    assert len(manifest["icons"]) == 2

def test_sw_js_exists():
    assert (DIST / "sw.js").exists()

def test_icon_192_correct_size():
    img = Image.open(DIST / "icons" / "icon-192.png")
    assert img.size == (192, 192)

def test_icon_512_correct_size():
    img = Image.open(DIST / "icons" / "icon-512.png")
    assert img.size == (512, 512)
```

- [ ] **Step 4: Run the tests and confirm they all fail**

```bash
cd "/Users/haru/Haru Cowork OS/second-brain/01_Projects/Ecom Vente/Resources/ZOIS DASHBOARD-2/ZOIS Dashboard"
pytest tests/test_build.py -v
```

Expected: all tests FAIL — `dist/` does not exist yet.

- [ ] **Step 5: Commit**

```bash
git add tests/
git commit -m "test: add failing PWA build output tests"
```

---

## Task 2: Create the Service Worker

**Files:**
- Create: `sw.js`

- [ ] **Step 1: Create `sw.js`**

```javascript
const CACHE_NAME = 'zois-v1';
const ASSETS = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add sw.js
git commit -m "feat: add PWA service worker"
```

---

## Task 3: Update Build Script to Produce dist/ Output

**Files:**
- Modify: `build-standalone.py`

- [ ] **Step 1: Replace the entire content of `build-standalone.py` with the following**

```python
#!/usr/bin/env python3
"""Builds PWA output in dist/ from stock-dashboard.html + css/ + js/ + images/."""
import base64, re, json, shutil
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).parent
DIST = ROOT / "dist"

# ── Read sources ──────────────────────────────────────────────────────────────
html = (ROOT / "stock-dashboard.html").read_text(encoding="utf-8")

css_files = [
    "variables.css","shell.css","setup.css","filters.css","grid.css",
    "modal.css","pill.css","online.css","settings.css","profile.css",
    "home.css","analytics.css","mobile.css",
]
js_files = [
    "state.js","idb.js","settings.js","parse.js","store-filters.js",
    "store-render.js","store-modal.js","online.js","profile.js","tabs.js","analytics.js",
]

css_block = "\n".join((ROOT/"css"/f).read_text(encoding="utf-8") for f in css_files)
js_block  = "\n".join((ROOT/"js"/f).read_text(encoding="utf-8")  for f in js_files)
logo_b64  = base64.b64encode((ROOT/"images"/"logo.png").read_bytes()).decode()
logo_uri  = f"data:image/png;base64,{logo_b64}"

# ── Replace external CSS links with one inline <style> ────────────────────────
html = re.sub(r'\n?<link rel="stylesheet" href="css/[^"]+\">', "", html)
html = html.replace(
    '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Jost:wght@300;400;500;600;700&display=swap" rel="stylesheet">',
    '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Jost:wght@300;400;500;600;700&display=swap" rel="stylesheet">\n<style>\n' + css_block + '\n</style>',
)

# ── Replace external JS scripts with one inline <script> ──────────────────────
html = re.sub(r'\n?<script src="js/[^"]+"></script>', "", html)
html = html.replace("</body>", f"<script>\n{js_block}\n</script>\n</body>")

# ── Embed logo as base64 data URI ─────────────────────────────────────────────
html = html.replace('src="images/logo.png"', f'src="{logo_uri}"')

# ── Inject PWA manifest link + apple meta tags (after <title>) ────────────────
pwa_head = (
    '\n<link rel="manifest" href="./manifest.json">'
    '\n<meta name="theme-color" content="#5a2c0a">'
    '\n<meta name="apple-mobile-web-app-capable" content="yes">'
    '\n<meta name="apple-mobile-web-app-title" content="ZOIS">'
    '\n<link rel="apple-touch-icon" href="./icons/icon-192.png">'
)
html = html.replace('</title>', '</title>' + pwa_head)

# ── Inject service worker registration (before </body>) ───────────────────────
sw_script = (
    "\n<script>"
    "\nif ('serviceWorker' in navigator) {"
    "\n  navigator.serviceWorker.register('./sw.js');"
    "\n}"
    "\n</script>"
)
html = html.replace("</body>", sw_script + "\n</body>")

# ── Build dist/ folder ────────────────────────────────────────────────────────
DIST.mkdir(exist_ok=True)
(DIST / "icons").mkdir(exist_ok=True)

# index.html
(DIST / "index.html").write_text(html, encoding="utf-8")

# manifest.json
manifest = {
    "name": "ZOIS Dashboard",
    "short_name": "ZOIS",
    "start_url": "./",
    "display": "standalone",
    "background_color": "#ffffff",
    "theme_color": "#5a2c0a",
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
    ],
}
(DIST / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

# sw.js
shutil.copy(ROOT / "sw.js", DIST / "sw.js")

# Icons — resize logo.png to 192×192 and 512×512
logo = Image.open(ROOT / "images" / "logo.png").convert("RGBA")
for size in (192, 512):
    icon = logo.resize((size, size), Image.LANCZOS)
    icon.save(DIST / "icons" / f"icon-{size}.png")

size_kb = (DIST / "index.html").stat().st_size / 1024
print(f"✓ dist/index.html ({size_kb:.0f} KB)")
print(f"✓ dist/manifest.json")
print(f"✓ dist/sw.js")
print(f"✓ dist/icons/icon-192.png, icon-512.png")
```

- [ ] **Step 2: Run the build manually and confirm it succeeds**

```bash
cd "/Users/haru/Haru Cowork OS/second-brain/01_Projects/Ecom Vente/Resources/ZOIS DASHBOARD-2/ZOIS Dashboard"
python3 build-standalone.py
```

Expected output:
```
✓ dist/index.html (930 KB)
✓ dist/manifest.json
✓ dist/sw.js
✓ dist/icons/icon-192.png, icon-512.png
```

- [ ] **Step 3: Run the full test suite and confirm all tests pass**

```bash
pytest tests/test_build.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add build-standalone.py
git commit -m "feat: update build script to produce PWA dist/ folder"
```

---

## Task 4: Add .gitignore

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```
dist/
__pycache__/
*.pyc
.DS_Store
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add .gitignore"
```

---

## Task 5: Add GitHub Actions Deployment Workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create the workflows directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create `.github/workflows/deploy.yml`**

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: pip install Pillow

      - name: Build PWA
        run: python build-standalone.py

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist/

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Commit**

```bash
git add .github/
git commit -m "ci: add GitHub Actions deploy workflow"
```

---

## Task 6: Create GitHub Repo and Push

This task is manual infrastructure setup.

- [ ] **Step 1: Create a new public GitHub repo**

Go to https://github.com/new and create a repo named `zois-dashboard`. Set it to **Public**. Do NOT initialise with a README (the local repo already has commits).

- [ ] **Step 2: Initialise a standalone git repo inside the ZOIS Dashboard folder**

The dashboard currently lives inside the `second-brain` submodule. It needs its own repo. Run from the ZOIS Dashboard folder:

```bash
cd "/Users/haru/Haru Cowork OS/second-brain/01_Projects/Ecom Vente/Resources/ZOIS DASHBOARD-2/ZOIS Dashboard"
git init
git add stock-dashboard.html build-standalone.py sw.js .gitignore css/ js/ images/ tests/ .github/ docs/
git commit -m "feat: initial ZOIS Dashboard PWA"
```

Note: this creates a nested `.git` inside the second-brain submodule. The outer repo ignores nested `.git` directories, so this does not affect your second-brain or Haru Cowork OS repos.

- [ ] **Step 3: Add the remote and push**

```bash
git remote add origin https://github.com/<your-username>/zois-dashboard.git
git branch -M main
git push -u origin main
```

Replace `<your-username>` with the actual GitHub username.

- [ ] **Step 4: Enable GitHub Pages in repo settings**

On GitHub: go to repo → **Settings** → **Pages** → under **Source** select **GitHub Actions** → Save.

- [ ] **Step 5: Watch the Actions run**

Go to the repo → **Actions** tab. The "Build and Deploy" workflow should start automatically. Wait for it to complete (≈60 seconds).

Expected: green checkmark. The URL `https://<your-username>.github.io/zois-dashboard/` is now live.

- [ ] **Step 6: Open the URL and verify**

Open `https://<your-username>.github.io/zois-dashboard/` in Chrome on desktop.

Verify:
- Dashboard loads correctly
- Install icon appears in the address bar (Chrome shows a `+` or computer icon)
- Click it → installs as a standalone app

- [ ] **Step 7: Test on phone**

Open the URL in Chrome on Android or Safari on iPhone.
- Android: tap the browser menu → "Add to Home Screen"
- iPhone: tap the Share button → "Add to Home Screen"

Verify: app icon appears on the home screen and opens without browser chrome.

---

## Task 7: Share with Staff

- [ ] **Step 1: Send the URL to staff via WhatsApp**

Message template:
```
ZOIS Dashboard is now available as an app.
Link: https://<your-username>.github.io/zois-dashboard/

On phone: open the link → tap "Add to Home Screen"
On PC: open the link → bookmark it (or click the install icon in the address bar)
```

- [ ] **Step 2: Confirm at least one staff member installs it successfully**

Get confirmation from one person before rolling out to the rest.

---

## Ongoing: Pushing Updates

Whenever you edit `css/` or `js/` files:

```bash
git add <changed files>
git commit -m "fix: ..."
git push
```

GitHub Actions rebuilds and redeploys automatically. Staff get the update silently on next open — no action needed from them.
