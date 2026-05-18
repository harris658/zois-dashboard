# ZOIS Dashboard — PWA Distribution Design

**Date:** 2026-05-18
**Status:** Approved
**Goal:** Make the ZOIS stock dashboard installable and always up-to-date for 5 staff members across phones and PCs — no file sharing, no setup friction, no version drift.

---

## Problem

The dashboard currently exists as a multi-file folder (`stock-dashboard.html` + `css/`, `js/`, `images/`). A standalone build script produces a single 945KB HTML. Sharing this file manually has three problems:
1. **Version drift** — staff get old copies with no way to know
2. **Setup friction** — staff don't know how to open/run a local folder of files
3. **Mobile** — staff need it on their phones, not just laptops

---

## Solution: PWA on GitHub Pages

Convert the dashboard to a Progressive Web App (PWA) hosted on GitHub Pages. Staff open one URL — it installs like a native app on phones, works as a bookmarked web app on PC, and updates silently on every push.

---

## Architecture

### Source (unchanged)
```
ZOIS Dashboard/
  stock-dashboard.html     ← main entry point
  css/                     ← 13 CSS files
  js/                      ← 11 JS files
  images/logo.png
  build-standalone.py      ← updated to produce PWA output folder
```

### Build Output (new)
```
dist/
  index.html               ← inlined CSS + JS (derived from stock-dashboard.html)
  manifest.json            ← PWA metadata (name, icons, display mode)
  sw.js                    ← service worker (cache-first, background update)
  icons/
    icon-192.png           ← generated from images/logo.png
    icon-512.png
```

### Deployment
- New GitHub repo: `zois-dashboard` (public, no sensitive data — dashboard is a tool, data stays on device via IndexedDB)
- GitHub Actions workflow: triggers on push to `main`, runs build script, deploys `dist/` to GitHub Pages
- Staff URL: `https://<org>.github.io/zois-dashboard`

---

## Components

### 1. Updated `build-standalone.py`
- Current behaviour: inlines all CSS/JS into one HTML file
- New behaviour: produces the full `dist/` folder with `index.html`, `manifest.json`, `sw.js`, and `icons/`
- Adds PWA registration snippet to `index.html` (`<link rel="manifest">` + service worker registration script)

### 2. `manifest.json`
```json
{
  "name": "ZOIS Dashboard",
  "short_name": "ZOIS",
  "start_url": "/zois-dashboard/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#5a2c0a",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 3. `sw.js` (Service Worker)
- Strategy: cache-first for app shell, network-first for updates
- On install: caches `index.html`, `manifest.json`, icons
- On activate: clears old caches, takes control immediately
- Background update: when a new version is detected, flags it and activates on next open

### 4. GitHub Actions Workflow (`.github/workflows/deploy.yml`)
- Trigger: push to `main`
- Steps: checkout → run `python build-standalone.py` → deploy `dist/` to `gh-pages` branch
- Estimated deploy time: ~60 seconds

---

## Data Flow

Staff data (uploaded spreadsheets, IndexedDB state) never leaves the device. The hosted files are purely the app shell — HTML, CSS, JS. No backend, no auth, no server-side state.

---

## Staff Setup

**Phone (one-time):**
1. Harshit shares the URL via WhatsApp
2. Staff opens URL in Chrome/Safari
3. Taps "Add to Home Screen"
4. Done — app icon appears on home screen

**PC (one-time):**
1. Open the URL in Chrome or Edge
2. Bookmark it (or click the install icon in the address bar for a standalone window)
3. Done

**After any update:**
Nothing. Service worker fetches the new version silently. Staff see the update on next open.

---

## Error Handling

- **Offline first open:** Service worker isn't cached yet — app won't load without internet. Acceptable; staff set up once on wifi.
- **Stale session:** If the app is open when an update deploys, the old version stays active until next open. Acceptable for a stock dashboard.
- **GitHub Pages down:** Extremely rare; no mitigation needed for internal tool.

---

## Out of Scope

- Authentication / login (dashboard is staff-internal, URL obscurity is sufficient)
- Push notifications
- Multi-user data sync (each staff member maintains their own local data)
- Android/iOS App Store distribution
