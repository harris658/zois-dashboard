#!/usr/bin/env python3
"""Builds PWA output in dist/ from stock-dashboard.html + css/ + js/ + images/."""
import base64, hashlib, re, json, shutil
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
css_block = css_block.replace("</style>", "<\\/style>")
js_block  = js_block.replace("</script>", "<\\/script>")
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

# sw.js — inject content hash into CACHE_NAME so browser detects each new deploy
content_hash = hashlib.md5(html.encode()).hexdigest()[:8]
sw_src = (ROOT / "sw.js").read_text(encoding="utf-8")
sw_src = sw_src.replace("'zois-v1'", f"'zois-{content_hash}'")
(DIST / "sw.js").write_text(sw_src, encoding="utf-8")

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
