# Analytics Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Store/Online home analytics into a three-block monthly-movement layout per `docs/superpowers/specs/2026-06-10-analytics-redesign-design.md`.

**Architecture:** A new `js/history.js` records one compact `{code → units}` entry per day in IndexedDB (migrating the old `store-snapshots`), and computes 30-day movement. `store-render.js` and `online.js` re-render their home views as THIS MONTH / LISTING HEALTH → collapsible STOCK BREAKDOWN → hints. The old snapshot/diff code is removed. CSS gets a consistent card system.

**Tech Stack:** Vanilla JS (no modules — files share one global scope), IndexedDB via existing `idb.js`, node:test + node:vm for unit tests, pytest for build tests.

**Context for the engineer:**
- All `js/*.js` files load as plain `<script>` tags in `stock-dashboard.html` AND are inlined in order by `build-standalone.py` (`js_files` list). Any new file must be added in BOTH places, same position.
- Functions are called at runtime across files (no imports). Load order only matters for top-level code.
- `tests/js/_context.mjs` loads real source files into a `node:vm` context with a stub DOM. Use `runJSON()` for structural assertions (vm objects fail `deepStrictEqual` across realms).
- The store search input is `id="q"`; store home container is `id="pgrid"`; online home container is `id="os-pgrid"`.
- Run all commands from the repo root: `/Users/haru/Haru Cowork OS/second-brain/01_Projects/Ecom Vente/Resources/ZOIS DASHBOARD-2/ZOIS Dashboard`
- This repo has its own git remote — commit/push from inside this folder only.

## File Structure

- Create: `js/history.js` — history engine (record, migrate, compute monthly movement)
- Create: `tests/js/history.test.mjs` — engine unit tests
- Modify: `js/parse.js` — remove `snapshotProducts`/`computeDiff`, call `recordHistory` from `launch()`
- Modify: `js/state.js` — remove `stockDiff` global
- Modify: `js/store-render.js` — new `renderHomeDashboard` (THIS MONTH + breakdown + hints), `searchByCode`
- Modify: `js/analytics.js` — shared collapse helpers; split online render into count + breakdown parts
- Modify: `js/online.js` — `renderOsPrompt` reordered (health → count → breakdown → hints)
- Modify: `css/analytics.css` — full rewrite (consistent card system)
- Modify: `css/home.css` — section label/toggle/note styles
- Modify: `stock-dashboard.html` — add `history.js` script tag
- Modify: `build-standalone.py` — add `history.js` to `js_files`
- Modify: `tests/test_build.py` — assert history engine is in the build

---

## Task 1: History engine (TDD)

**Files:**
- Create: `tests/js/history.test.mjs`
- Create: `js/history.js`

- [ ] **Step 1: Write the failing tests — `tests/js/history.test.mjs`**

```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeContext, loadScripts, run, runJSON } from './_context.mjs';

let ctx, idb;
beforeEach(() => {
  idb = new Map();
  ctx = makeContext({
    idbGet: async (k) => idb.get(k),
    idbSave: async (k, v) => { idb.set(k, v); },
    idbDelete: async (k) => { idb.delete(k); },
  });
  loadScripts(ctx, ['history.js']);
});

const J = (v) => JSON.parse(JSON.stringify(v));

// ── buildDayEntry ────────────────────────────────────────────────────────────

test('buildDayEntry sums units per code, keeps zero-unit codes, skips blank codes', () => {
  ctx.__p = [
    { code: 'K1', sizes: { S: 2, M: 1 } },
    { code: 'K2', sizes: {} },
    { code: 'K1', sizes: { L: 1 } },
    { code: '', sizes: { S: 9 } },
  ];
  assert.deepEqual(runJSON(ctx, 'buildDayEntry(__p)'), { K1: 4, K2: 0 });
});

// ── recordHistory ────────────────────────────────────────────────────────────

test('recordHistory creates history with start, day entry, and firstSeen', async () => {
  ctx.__p = [{ code: 'K1', sizes: { S: 2 } }];
  await run(ctx, "recordHistory(__p, new Date('2026-06-10T12:00:00'))");
  const h = J(idb.get('store-history'));
  assert.equal(h.start, '2026-06-10');
  assert.deepEqual(h.days['2026-06-10'], { K1: 2 });
  assert.equal(h.firstSeen.K1, '2026-06-10');
});

test('recordHistory overwrites the same day and prunes entries older than 35 days', async () => {
  idb.set('store-history', {
    start: '2026-04-01',
    days: { '2026-04-01': { K9: 5 }, '2026-06-09': { K1: 3 } },
    firstSeen: { K9: '2026-04-01', K1: '2026-06-09' },
  });
  ctx.__p = [{ code: 'K1', sizes: { S: 2 } }];
  await run(ctx, "recordHistory(__p, new Date('2026-06-10T12:00:00'))");
  const h = J(idb.get('store-history'));
  assert.equal(h.days['2026-04-01'], undefined); // pruned (> 35 days old)
  assert.deepEqual(h.days['2026-06-10'], { K1: 2 });
  assert.deepEqual(h.days['2026-06-09'], { K1: 3 });
});

test('recordHistory migrates old store-snapshots on first run and deletes them', async () => {
  idb.set('store-snapshots', [
    { date: '2026-06-08T10:00:00', products: [{ code: 'K1', sizes: { S: 5 } }] },
    { date: '2026-06-09T10:00:00', products: [{ code: 'K1', sizes: { S: 3 } }] },
  ]);
  ctx.__p = [{ code: 'K1', sizes: { S: 2 } }];
  await run(ctx, "recordHistory(__p, new Date('2026-06-10T12:00:00'))");
  const h = J(idb.get('store-history'));
  assert.equal(h.start, '2026-06-08');
  assert.deepEqual(h.days['2026-06-08'], { K1: 5 });
  assert.deepEqual(h.days['2026-06-09'], { K1: 3 });
  assert.deepEqual(h.days['2026-06-10'], { K1: 2 });
  assert.equal(h.firstSeen.K1, '2026-06-08');
  assert.equal(idb.get('store-snapshots'), undefined);
});

// ── computeMonthlyMovement ──────────────────────────────────────────────────

test('returns trackedDays<2 shape when history has under two days', () => {
  ctx.__hist = { start: '2026-06-10', days: { '2026-06-10': { K1: 2 } }, firstSeen: { K1: '2026-06-10' } };
  const mv = runJSON(ctx, "computeMonthlyMovement(__hist, new Date('2026-06-10T12:00:00'))");
  assert.equal(mv.trackedDays, 1);
  assert.equal(mv.since, '2026-06-10');
  assert.deepEqual(mv.movers, []);
});

test('counts drops as units out, vanished codes as fully sold, ignores restocks', () => {
  ctx.__hist = {
    start: '2026-06-01',
    days: {
      '2026-06-01': { K1: 5, K2: 3 },
      '2026-06-05': { K1: 3, K2: 4 },
      '2026-06-08': { K2: 4 },
    },
    firstSeen: { K1: '2026-06-01', K2: '2026-06-01' },
  };
  const mv = runJSON(ctx, "computeMonthlyMovement(__hist, new Date('2026-06-10T12:00:00'))");
  assert.equal(mv.unitsOut, 5);       // K1: 5→3 (2) then 3→gone (3)
  assert.equal(mv.stylesMoved, 1);    // K2 only restocked, never dropped
  assert.deepEqual(mv.movers, [{ code: 'K1', units: 5 }]);
});

test('newArrivals counts firstSeen inside the window but excludes the initial import', () => {
  ctx.__hist = {
    start: '2026-06-01',
    days: { '2026-06-01': { K1: 5 }, '2026-06-05': { K1: 5, K3: 2 } },
    firstSeen: { K1: '2026-06-01', K3: '2026-06-05' },
  };
  const mv = runJSON(ctx, "computeMonthlyMovement(__hist, new Date('2026-06-10T12:00:00'))");
  assert.equal(mv.newArrivals, 1); // K3 only — K1 was the initial import (firstSeen == start)
});

test('movers are top 5 sorted by units out', () => {
  const days = { '2026-06-01': {}, '2026-06-02': {} };
  const firstSeen = {};
  for (let i = 1; i <= 7; i++) {
    days['2026-06-01']['C' + i] = 10;
    days['2026-06-02']['C' + i] = 10 - i; // C7 drops most
    firstSeen['C' + i] = '2026-06-01';
  }
  ctx.__hist = { start: '2026-06-01', days, firstSeen };
  const mv = runJSON(ctx, "computeMonthlyMovement(__hist, new Date('2026-06-10T12:00:00'))");
  assert.equal(mv.movers.length, 5);
  assert.equal(mv.movers[0].code, 'C7');
  assert.equal(mv.movers[0].units, 7);
  assert.equal(mv.movers[4].code, 'C3');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/js/history.test.mjs`
Expected: FAIL — `Cannot find ... js/history.js` (loadScripts throws ENOENT).

- [ ] **Step 3: Write `js/history.js`**

```js
// ── Stock movement history ──────────────────────────────────────────────────
// Compact per-day record of units per style, kept ~35 days in IndexedDB.
// Written on every successful launch() (manual upload, IDB restore, disk link,
// central feed). Replaces the old store-snapshots mechanism (migrated once).

const HISTORY_KEY = 'store-history';
const HISTORY_KEEP_DAYS = 35;
const MOVEMENT_WINDOW_DAYS = 30;

window._histCache = null;

function _dayKey(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.getFullYear() + '-' +
    String(dt.getMonth() + 1).padStart(2, '0') + '-' +
    String(dt.getDate()).padStart(2, '0');
}

function _daysAgoKey(days, now) {
  const base = now instanceof Date ? now.getTime() : Date.now();
  return _dayKey(new Date(base - days * 86400000));
}

function buildDayEntry(productsArr) {
  const entry = {};
  (productsArr || []).forEach(p => {
    if (!p.code) return;
    const units = Object.values(p.sizes || {}).reduce((a, b) => a + b, 0);
    entry[p.code] = (entry[p.code] || 0) + units;
  });
  return entry;
}

async function _migrateSnapshots() {
  const snaps = await idbGet('store-snapshots');
  if (!snaps || !snaps.length) return null;
  const hist = { start: null, days: {}, firstSeen: {} };
  snaps.forEach(s => {
    const key = _dayKey(new Date(s.date));
    hist.days[key] = buildDayEntry(s.products); // later snapshot same day wins
    if (!hist.start || key < hist.start) hist.start = key;
    Object.keys(hist.days[key]).forEach(code => {
      if (!hist.firstSeen[code] || key < hist.firstSeen[code]) hist.firstSeen[code] = key;
    });
  });
  await idbDelete('store-snapshots');
  return hist;
}

async function recordHistory(productsArr, now) {
  try {
    let hist = await idbGet(HISTORY_KEY);
    if (!hist) hist = await _migrateSnapshots();
    if (!hist) hist = { start: null, days: {}, firstSeen: {} };

    const key = _dayKey(now || new Date());
    if (!hist.start) hist.start = key;
    hist.days[key] = buildDayEntry(productsArr);
    Object.keys(hist.days[key]).forEach(code => {
      if (!hist.firstSeen[code]) hist.firstSeen[code] = key;
    });

    const cutoff = _daysAgoKey(HISTORY_KEEP_DAYS, now);
    Object.keys(hist.days).forEach(k => { if (k < cutoff) delete hist.days[k]; });

    await idbSave(HISTORY_KEY, hist);
    window._histCache = hist;
    return hist;
  } catch (e) {
    console.log('history record failed:', e);
    return null;
  }
}

function computeMonthlyMovement(hist, now) {
  if (!hist || !hist.days) return null;
  const cutoff = _daysAgoKey(MOVEMENT_WINDOW_DAYS, now);
  const keys = Object.keys(hist.days).filter(k => k >= cutoff).sort();
  const result = {
    trackedDays: keys.length,
    since: keys[0] || null,
    stylesMoved: 0,
    unitsOut: 0,
    newArrivals: 0,
    movers: [],
  };
  if (keys.length < 2) return result;

  const outByCode = {};
  for (let i = 1; i < keys.length; i++) {
    const prev = hist.days[keys[i - 1]];
    const cur  = hist.days[keys[i]];
    Object.keys(prev).forEach(code => {
      // Vanished code = sold out: launch() filters out styles with zero stock
      const after = code in cur ? cur[code] : 0;
      if (after < prev[code]) outByCode[code] = (outByCode[code] || 0) + (prev[code] - after);
    });
  }

  result.movers = Object.entries(outByCode)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, units]) => ({ code, units }));
  result.stylesMoved = Object.keys(outByCode).length;
  result.unitsOut = Object.values(outByCode).reduce((a, b) => a + b, 0);
  result.newArrivals = Object.values(hist.firstSeen)
    .filter(d => d >= cutoff && d > hist.start).length;
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/js/history.test.mjs`
Expected: 8 tests PASS.

- [ ] **Step 5: Run the full existing suites to confirm nothing broke**

Run: `node --test tests/js/*.test.mjs && python3 -m pytest tests/ -q`
Expected: all PASS (history.js isn't loaded anywhere else yet).

- [ ] **Step 6: Commit**

```bash
git add js/history.js tests/js/history.test.mjs
git commit -m "feat: stock movement history engine"
```

---

## Task 2: Wire history.js into the app and build (additive — old diff code stays for now)

**Files:**
- Modify: `stock-dashboard.html` (script tags at the bottom, around line 556)
- Modify: `build-standalone.py` (`js_files` list)
- Modify: `js/parse.js` (end of `launch()`)
- Modify: `tests/test_build.py`

- [ ] **Step 1: Add the script tag to `stock-dashboard.html`**

Change:
```html
<script src="js/state.js"></script>
<script src="js/idb.js"></script>
```
to:
```html
<script src="js/state.js"></script>
<script src="js/idb.js"></script>
<script src="js/history.js"></script>
```

- [ ] **Step 2: Add to `js_files` in `build-standalone.py`**

Change:
```python
js_files = [
    "state.js","idb.js","settings.js","parse.js","store-filters.js",
    "store-render.js","store-modal.js","online.js","feed.js","profile.js","tabs.js","analytics.js",
]
```
to:
```python
js_files = [
    "state.js","idb.js","history.js","settings.js","parse.js","store-filters.js",
    "store-render.js","store-modal.js","online.js","feed.js","profile.js","tabs.js","analytics.js",
]
```

- [ ] **Step 3: Record history on every launch — in `js/parse.js`, end of `launch()`**

Change the last two lines of `launch()`:
```js
  document.getElementById('s-total').textContent = products.length;
  computeDiff();
}
```
to:
```js
  document.getElementById('s-total').textContent = products.length;
  computeDiff();
  recordHistory(products).then(() => {
    const pgrid = document.getElementById('pgrid');
    if (pgrid && pgrid.querySelector('.home-dash')) renderHomeDashboard();
  });
}
```

- [ ] **Step 4: Add a build test — append to `tests/test_build.py`**

```python
def test_history_engine_in_build():
    html = (DIST / "index.html").read_text()
    assert "computeMonthlyMovement" in html
    assert "recordHistory" in html
```

- [ ] **Step 5: Run both suites**

Run: `python3 -m pytest tests/ -q && node --test tests/js/*.test.mjs`
Expected: all PASS (23 pytest, 25 node).

- [ ] **Step 6: Commit**

```bash
git add stock-dashboard.html build-standalone.py js/parse.js tests/test_build.py
git commit -m "feat: record stock history on every launch"
```

---

## Task 3: Store home — THIS MONTH + collapsible breakdown; remove old diff code

**Files:**
- Modify: `js/analytics.js` (add collapse helpers; change `renderStoreAnalyticsHTML` wrapper class)
- Modify: `js/store-render.js` (replace `renderHomeDashboard`, lines 83–126)
- Modify: `js/parse.js` (delete `snapshotProducts` and `computeDiff`, remove their call sites)
- Modify: `js/state.js` (delete `stockDiff` global)

- [ ] **Step 1: Add shared collapse helpers at the top of `js/analytics.js`** (after the `Rs` constant)

```js
// ── Collapsible section (shared by store + online home views) ─────────────
function renderCollapse(which, title, innerHTML) {
  const open = localStorage.getItem('zois-collapse-' + which) === '1';
  return '<div class="home-section">' +
    '<button class="hs-toggle' + (open ? ' open' : '') + '" onclick="toggleCollapse(this, \'' + which + '\')">' +
      '<span class="hs-title">' + title + '</span><span class="hs-chev">▾</span>' +
    '</button>' +
    '<div class="hs-body"' + (open ? '' : ' style="display:none"') + '>' + innerHTML + '</div>' +
    '</div>';
}

function toggleCollapse(btn, which) {
  const body = btn.parentElement.querySelector('.hs-body');
  const open = body.style.display === 'none';
  body.style.display = open ? '' : 'none';
  btn.classList.toggle('open', open);
  localStorage.setItem('zois-collapse-' + which, open ? '1' : '0');
}
```

- [ ] **Step 2: In `js/analytics.js`, change the wrapper of `renderStoreAnalyticsHTML`**

The function currently returns `` `<div class="home-section"> ... </div>` ``. Change the
opening to `<div class="a-breakdown">` (closing tag unchanged) — it now renders *inside*
a section instead of being one:

```js
  return `<div class="a-breakdown">
```

- [ ] **Step 3: Replace `renderHomeDashboard` in `js/store-render.js` (lines 83–126) with**

```js
function renderHomeDashboard() {
  const grid = document.getElementById('pgrid');
  let html = '<div class="home-dash">';
  html += renderMonthBlockHTML();
  if (products.length) html += renderCollapse('store', 'Stock Breakdown', renderStoreAnalyticsHTML());
  html += '<div class="home-hints">' +
    '<span class="hint-chip">Search by code or name</span>' +
    '<span class="hint-chip">Filter by size</span>' +
    '<span class="hint-chip">Filter by colour</span>' +
    '</div>';
  html += '</div>';
  grid.innerHTML = html;
}

function _fmtDayKey(key) {
  return new Date(key).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function renderMonthBlockHTML() {
  const mv = window._histCache ? computeMonthlyMovement(window._histCache) : null;
  let inner;
  if (!mv || mv.trackedDays < 2) {
    const sinceTxt = mv && mv.since ? _fmtDayKey(mv.since) : 'today';
    inner = '<div class="hs-note">Tracking started ' + sinceTxt +
      ' — movement appears here as daily updates build up.</div>';
  } else {
    const nameOf = code => {
      const p = products.find(x => x.code === code);
      return p && p.name ? p.name : '';
    };
    inner =
      '<div class="a-kpi-row a-kpi-row-3">' +
        '<div class="a-kpi hi"><div class="a-kpi-label">Styles Moved</div>' +
          '<div class="a-kpi-val">' + N(mv.stylesMoved) + '</div>' +
          '<div class="a-kpi-sub">last ' + mv.trackedDays + ' tracked days</div></div>' +
        '<div class="a-kpi"><div class="a-kpi-label">Units Out</div>' +
          '<div class="a-kpi-val">' + N(mv.unitsOut) + '</div>' +
          '<div class="a-kpi-sub">estimated sold</div></div>' +
        '<div class="a-kpi"><div class="a-kpi-label">New Arrivals</div>' +
          '<div class="a-kpi-val">' + N(mv.newArrivals) + '</div>' +
          '<div class="a-kpi-sub">styles added</div></div>' +
      '</div>';
    if (mv.movers.length) {
      inner += '<div class="a-card"><div class="a-card-title">Biggest Movers</div><div class="diff-list">' +
        mv.movers.map(m =>
          '<div class="diff-row tappable" onclick="searchByCode(\'' + escHtml(m.code) + '\')">' +
            '<span class="diff-code">' + escHtml(m.code) + '</span>' +
            '<span class="diff-name">' + escHtml(nameOf(m.code).slice(0, 28)) + '</span>' +
            '<span class="diff-chip sold">−' + m.units + '</span>' +
          '</div>').join('') +
        '</div></div>';
    }
  }
  return '<div class="home-section">' +
    '<div class="hs-title">This Month <span class="hs-sub">estimated from stock changes</span></div>' +
    inner + '</div>';
}

function searchByCode(code) {
  const q = document.getElementById('q');
  if (!q) return;
  q.value = code;
  applyFilters();
}

function renderPrompt() { renderHomeDashboard(); }
```

(The old `stockDiff` block, `renderCol`, and the previous `renderPrompt` line are all
replaced by the above. `PLATFORM_LABELS` on line 81 stays.)

- [ ] **Step 4: Remove the old snapshot/diff code from `js/parse.js`**

1. Delete the entire `// ── Snapshot & diff ──...` section — both functions
   `snapshotProducts()` and `computeDiff()` (the block between the `setStatus`
   helper and the `// ── Parse ──...` comment).
2. In `parseFile()`, delete the line `await snapshotProducts();`.
3. At the end of `launch()`, delete the line `computeDiff();` (keep the
   `recordHistory(...)` block added in Task 2).

- [ ] **Step 5: Remove the `stockDiff` global from `js/state.js`**

Delete the line:
```js
let stockDiff         = null; // stock delta vs previous upload [{code,name,delta}]
```

- [ ] **Step 6: Verify no dangling references**

Run: `grep -rn "stockDiff\|computeDiff\|snapshotProducts" js/ stock-dashboard.html`
Expected: no matches. (`store-snapshots` in history.js is fine — that's the migration.)

- [ ] **Step 7: Run both suites**

Run: `python3 -m pytest tests/ -q && node --test tests/js/*.test.mjs`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add js/analytics.js js/store-render.js js/parse.js js/state.js
git commit -m "feat: store home — This Month block + collapsible breakdown"
```

---

## Task 4: Online home — health → count → collapsed breakdown

**Files:**
- Modify: `js/analytics.js` (split `renderOsAnalyticsHTML` into two parts)
- Modify: `js/online.js` (`renderOsPrompt` reorder)

- [ ] **Step 1: In `js/analytics.js`, replace `renderOsAnalyticsHTML` with two functions**

Keep `computeOsAnalytics()` unchanged. Replace the whole `renderOsAnalyticsHTML`
function with:

```js
// ── Online Analytics: Stock Count (always visible) ─────────────────────────
function renderOsCountHTML() {
  const data = computeOsAnalytics();
  if (!data) return '';
  const { totalSKUs, totalActual, totalExpected, variance, exactMatch, withVariance, outOfStock } = data;

  const varClass = variance === 0 ? 'ok' : variance < 0 ? 'err' : 'warn';
  const varLabel = variance === 0 ? 'perfectly balanced' : variance > 0 ? 'excess stock' : 'stock shortage';

  const maxAcc = Math.max(exactMatch, withVariance, outOfStock, 1);
  const band = (status, label, count, color) =>
    '<div class="a-band-item" onclick="filterOsByStatus(\'' + status + '\')">' +
      '<div class="a-band-meta"><span class="a-band-lbl">' + label + '</span>' +
      '<span class="a-band-nums">' + N(count) + ' styles</span></div>' +
      '<div class="a-band-track"><div class="a-band-fill" style="width:' +
      (count / maxAcc * 100).toFixed(1) + '%;background:var(--' + color + ')"></div></div>' +
    '</div>';

  return '<div class="home-section">' +
    '<div class="hs-title">Stock Count</div>' +
    '<div class="a-kpi-row a-kpi-row-4">' +
      '<div class="a-kpi hi"><div class="a-kpi-label">Total SKUs</div><div class="a-kpi-val">' + N(totalSKUs) + '</div><div class="a-kpi-sub">unique base codes</div></div>' +
      '<div class="a-kpi"><div class="a-kpi-label">Actual</div><div class="a-kpi-val">' + N(totalActual) + '</div><div class="a-kpi-sub">pieces counted</div></div>' +
      '<div class="a-kpi"><div class="a-kpi-label">Expected</div><div class="a-kpi-val">' + N(totalExpected) + '</div><div class="a-kpi-sub">per system</div></div>' +
      '<div class="a-kpi ' + varClass + '"><div class="a-kpi-label">Variance</div><div class="a-kpi-val">' + (variance >= 0 ? '+' : '') + N(variance) + '</div><div class="a-kpi-sub">' + varLabel + '</div></div>' +
    '</div>' +
    '<div class="a-card"><div class="a-card-title">Stock Accuracy</div><div class="a-band-list">' +
      band('exact', 'Exact Match', exactMatch, 'ok') +
      band('diff', 'Has Variance', withVariance, 'warn') +
      band('out', 'Has Out-of-Stock Size', outOfStock, 'err') +
    '</div></div>' +
  '</div>';
}

// ── Online Analytics: Breakdown (collapsed) ────────────────────────────────
function renderOsBreakdownHTML() {
  const data = computeOsAnalytics();
  if (!data) return '';
  const { catMap, sizeMap } = data;

  const catRows = Object.entries(catMap).sort((a, b) => b[1].actual - a[1].actual);
  const hasCats = catRows.length > 1;
  const maxCatUnits = Math.max(...catRows.map(([, v]) => v.actual), 1);

  const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  const allSizes = [
    ...SIZE_ORDER.filter(s => sizeMap[s] > 0),
    ...Object.keys(sizeMap).filter(s => !SIZE_ORDER.includes(s) && sizeMap[s] > 0),
  ];
  const maxSizeUnits = Math.max(...allSizes.map(s => sizeMap[s]), 1);

  const catTableRows = catRows.map(([catName, v]) => {
    const accPct = v.expected > 0 ? Math.round(v.actual / v.expected * 100) : 100;
    return '<tr onclick="filterOsByStat(\'os-f-cat\',\'' + escHtml(catName) + '\')">' +
      '<td><div class="a-pt-name">' + escHtml(catName) + '</div>' +
      '<div class="a-pt-bar-wrap"><div class="a-pt-bar" style="width:' + (v.actual / maxCatUnits * 100).toFixed(1) + '%"></div></div></td>' +
      '<td>' + N(v.skus) + '</td><td>' + N(v.actual) + '</td><td>' + accPct + '%</td></tr>';
  }).join('');

  const sizeBarRows = allSizes.map(sz =>
    '<div class="a-bar-row" onclick="filterOsByStat(\'os-f-size\',\'' + escHtml(sz) + '\')">' +
      '<span class="a-bar-lbl">' + escHtml(sz) + '</span>' +
      '<div class="a-bar-track"><div class="a-bar-fill" style="width:' + (sizeMap[sz] / maxSizeUnits * 100).toFixed(1) + '%"></div></div>' +
      '<span class="a-bar-val">' + N(sizeMap[sz]) + '</span>' +
    '</div>'
  ).join('');

  const sizeCard = '<div class="a-card"><div class="a-card-title">Units By Size</div><div class="a-bar-list">' + sizeBarRows + '</div></div>';

  if (!hasCats) return '<div class="a-breakdown">' + sizeCard + '</div>';

  return '<div class="a-breakdown"><div class="a-two-col">' +
    '<div class="a-card"><div class="a-card-title">By Category</div>' +
      '<table class="a-prod-table"><thead><tr><th>Category</th><th>SKUs</th><th>Actual</th><th>Accuracy</th></tr></thead>' +
      '<tbody>' + catTableRows + '</tbody></table></div>' +
    sizeCard +
  '</div></div>';
}
```

- [ ] **Step 2: Reorder `renderOsPrompt` in `js/online.js`**

Replace the whole `renderOsPrompt` function with (platform-cards logic is the existing
code, moved before analytics and retitled):

```js
function renderOsPrompt() {
  const grid = document.getElementById('os-pgrid');
  let html = '<div class="home-dash">';

  // ── 1. Listing health — platform cards, OOS first ────────────────────────
  if (dailyFeedStats && Object.keys(dailyFeedStats).length) {
    const useProducts = onlineProducts.length > 0 && Object.keys(platformStylesMap).length > 0;
    html += '<div class="home-section"><div class="hs-title">Listing Health</div><div class="platform-cards">';
    Object.entries(PLATFORM_LABELS).forEach(([key, label]) => {
      if (!dailyFeedStats[key]) return;
      let styles, skus, outOfStock;
      if (useProducts) {
        const listed = onlineProducts.filter(p => {
          const pm = platformStylesMap[p.baseCode.toLowerCase()];
          return pm && pm.has(key);
        });
        styles     = listed.length;
        skus       = listed.reduce((n, p) => n + p.sizes.length, 0);
        outOfStock = listed.reduce((n, p) => n + p.sizes.filter(s => s.actual === 0).length, 0);
      } else {
        const s = dailyFeedStats[key];
        styles = s.styles; skus = s.skus; outOfStock = s.outOfStock;
      }
      const oosHtml = outOfStock
        ? '<div class="pc-oos">' + outOfStock + ' out of stock</div>'
        : '<div class="pc-oos pc-ok">All in stock</div>';
      html += '<div class="platform-card' + (osPlatformFilter === key ? ' pc-active' : '') + '" onclick="togglePlatformFilter(\'' + key + '\')">' +
        '<div class="pc-name">' + label + '</div>' +
        oosHtml +
        '<div class="pc-stat"><span class="pc-num">' + styles + '</span> styles</div>' +
        '<div class="pc-skus">' + skus + ' SKUs</div>' +
        '</div>';
    });
    html += '</div></div>';
  }

  // ── 2. Stock count ────────────────────────────────────────────────────────
  if (onlineProducts && onlineProducts.length) {
    html += renderOsCountHTML();
    // ── 3. Breakdown (collapsed) ────────────────────────────────────────────
    html += renderCollapse('online', 'Stock Breakdown', renderOsBreakdownHTML());
  }

  // ── Hints ────────────────────────────────────────────────────────────────
  html += '<div class="home-hints">' +
    '<span class="hint-chip">Search by code or name</span>' +
    '<span class="hint-chip">Filter by size</span>' +
    '<span class="hint-chip">Filter by colour</span>' +
    '</div>';

  html += '</div>';
  grid.innerHTML = html;
}
```

(Differences from the old version: platform cards come FIRST with OOS directly under
the platform name; analytics is split into always-visible count + collapsed breakdown.)

- [ ] **Step 3: Verify no references to the removed function remain**

Run: `grep -rn "renderOsAnalyticsHTML" js/`
Expected: no matches.

- [ ] **Step 4: Run both suites**

Run: `python3 -m pytest tests/ -q && node --test tests/js/*.test.mjs`
Expected: all PASS (`online.test.mjs` loads online.js — `renderOsPrompt` references
`renderOsCountHTML` etc. only at call time, so loading still works).

- [ ] **Step 5: Commit**

```bash
git add js/analytics.js js/online.js
git commit -m "feat: online home — listing health first, collapsed breakdown"
```

---

## Task 5: CSS — consistent card system

**Files:**
- Modify: `css/home.css` (append new styles)
- Modify: `css/analytics.css` (full replacement)

- [ ] **Step 1: Check the inline `<style>` block in `stock-dashboard.html` (lines ~24–113)**

Run: `sed -n '24,113p' stock-dashboard.html | grep -E "a-kpi|a-card|a-two-col|hs-|home-" || echo CLEAR`
Expected: `CLEAR`. If anything prints, those rules override external CSS (the inline
block loads last) — update them there too, matching the styles below.

- [ ] **Step 2: Append to `css/home.css`**

```css
/* ── Section label extras ────────────────────────────────────── */
.hs-sub {
  font-weight: 500;
  letter-spacing: .02em;
  text-transform: none;
  color: var(--light);
  font-size: 10px;
  margin-left: 6px;
}

.hs-note {
  font-size: 13px;
  color: var(--mid);
  font-style: italic;
  background: var(--white);
  border: 1px dashed var(--border);
  border-radius: 10px;
  padding: 14px;
}

/* ── Collapsible section toggle ──────────────────────────────── */
.hs-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: none;
  border: none;
  border-bottom: 1px solid var(--border2);
  padding: 4px 0 8px;
  cursor: pointer;
  font-family: var(--sans);
}

.hs-chev {
  color: var(--light);
  font-size: 12px;
  transition: transform .15s var(--ease);
}

.hs-toggle.open .hs-chev { transform: rotate(180deg); }

.diff-row.tappable { cursor: pointer; border-radius: 6px; }
.diff-row.tappable:hover .diff-code { color: var(--br); }
```

- [ ] **Step 3: Replace the full contents of `css/analytics.css` with**

```css
/* ── Analytics — KPIs ────────────────────────────────────────── */
.a-kpi-row,
.a-kpi-row-3,
.a-kpi-row-4 {
  display: grid;
  gap: 10px;
}

.a-kpi-row   { grid-template-columns: repeat(2, 1fr); }
.a-kpi-row-3 { grid-template-columns: repeat(3, 1fr); }
.a-kpi-row-4 { grid-template-columns: repeat(4, 1fr); }

@media (max-width: 700px) {
  .a-kpi-row-4 { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 420px) {
  .a-kpi-row-3 { grid-template-columns: 1fr 1fr; }
  .a-kpi-row-3 .a-kpi:first-child { grid-column: 1 / -1; }
}

.a-kpi {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.a-kpi.hi   { border-color: var(--tan); background: var(--br-tint); }
.a-kpi.ok   { border-color: var(--ok-border);   background: var(--ok-bg); }
.a-kpi.warn { border-color: var(--warn-border); background: var(--warn-bg); }
.a-kpi.err  { border-color: var(--err-border);  background: var(--err-bg); }

.a-kpi-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .07em;
  color: var(--light);
}

.a-kpi.ok .a-kpi-label   { color: var(--ok); }
.a-kpi.warn .a-kpi-label { color: var(--warn); }
.a-kpi.err .a-kpi-label  { color: var(--err); }

.a-kpi-val {
  font-size: 26px;
  font-weight: 700;
  font-family: var(--serif);
  color: var(--dark);
  line-height: 1.1;
}

.a-kpi-sub { font-size: 11px; color: var(--mid); }

/* ── Cards ───────────────────────────────────────────────────── */
.a-card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
}

.a-card-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .07em;
  color: var(--light);
  margin-bottom: 10px;
}

.a-breakdown {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 10px;
}

.a-two-col {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 12px;
  align-items: start;
}

@media (max-width: 760px) { .a-two-col { grid-template-columns: 1fr; } }

.a-right-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Category table ──────────────────────────────────────────── */
.a-prod-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.a-prod-table th {
  text-align: left;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--light);
  padding: 0 8px 8px 0;
  border-bottom: 1px solid var(--border2);
}

.a-prod-table th:not(:first-child),
.a-prod-table td:not(:first-child) { text-align: right; white-space: nowrap; }

.a-prod-table td {
  padding: 8px 8px 8px 0;
  border-bottom: 1px solid var(--border2);
  color: var(--mid);
  vertical-align: middle;
}

.a-prod-table tr:last-child td { border-bottom: none; }
.a-prod-table tbody tr { cursor: pointer; }
.a-prod-table tbody tr:hover .a-pt-name { color: var(--br); }

.a-pt-name { font-weight: 600; color: var(--dark); font-size: 12px; }

.a-pt-bar-wrap {
  height: 4px;
  background: var(--bg2);
  border-radius: 2px;
  margin-top: 5px;
  overflow: hidden;
  max-width: 180px;
}

.a-pt-bar { height: 100%; background: var(--tan); border-radius: 2px; }

/* ── Size bars ───────────────────────────────────────────────── */
.a-bar-list { display: flex; flex-direction: column; gap: 8px; }

.a-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.a-bar-row:hover .a-bar-lbl { color: var(--br); }

.a-bar-lbl {
  width: 38px;
  font-size: 11px;
  font-weight: 700;
  color: var(--dark);
  flex-shrink: 0;
}

.a-bar-track {
  flex: 1;
  height: 6px;
  background: var(--bg2);
  border-radius: 3px;
  overflow: hidden;
}

.a-bar-fill { height: 100%; background: var(--br); border-radius: 3px; }

.a-bar-val {
  width: 44px;
  text-align: right;
  font-size: 11px;
  font-weight: 600;
  color: var(--mid);
  flex-shrink: 0;
}

/* ── Bands (price / accuracy) ────────────────────────────────── */
.a-band-list { display: flex; flex-direction: column; gap: 10px; }

.a-band-item { cursor: pointer; }
.a-band-item:hover .a-band-lbl { color: var(--br); }

.a-band-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}

.a-band-lbl { font-size: 12px; font-weight: 600; color: var(--dark); }
.a-band-nums { font-size: 11px; color: var(--light); }

.a-band-track {
  height: 6px;
  background: var(--bg2);
  border-radius: 3px;
  overflow: hidden;
}

.a-band-fill { height: 100%; background: var(--tan); border-radius: 3px; }

.a-footnote { font-size: 11px; color: var(--light); font-style: italic; }
```

- [ ] **Step 4: Build and run both suites**

Run: `python3 build-standalone.py && python3 -m pytest tests/ -q && node --test tests/js/*.test.mjs`
Expected: build prints the ✓ lines; all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add css/home.css css/analytics.css
git commit -m "style: consistent analytics card system"
```

---

## Task 6: Manual verification, deploy, register

- [ ] **Step 1: Open `stock-dashboard.html` directly in a browser**

Verify, in order:
1. Store tab with no saved data → setup screen unchanged.
2. Upload a stock Excel/CSV → map columns → Launch → home shows
   "THIS MONTH — Tracking started <today> …" note, collapsed Stock Breakdown,
   hint chips. Expanding the breakdown shows KPIs/category/size/price restyled.
3. Toggle the breakdown, reload the page (data restores from IDB) → toggle state
   is remembered.
4. Re-upload the same file with one product's qty reduced → after launch the
   THIS MONTH block still shows the tracking note (same-day entries overwrite —
   movement needs 2 different days; this is correct behaviour).
5. Tap a category row inside the breakdown → grid filters (existing behaviour).
6. Online tab: upload the online file → home shows Listing Health platform cards
   first (OOS line under the platform name), Stock Count, collapsed breakdown.
7. Search box, size/colour filters, sort, product modal all behave unchanged.

- [ ] **Step 2: Push and watch CI**

```bash
git push
gh run watch --exit-status $(gh run list --limit 1 --json databaseId -q '.[0].databaseId')
```
Expected: tests + build + deploy all green.

- [ ] **Step 3: Verify live in an incognito window**

Open https://harris658.github.io/zois-dashboard/ in incognito (the SW caches
aggressively). Upload a file and confirm the new home layout renders.

- [ ] **Step 4: Register edits in the dual-graph**

Call `graph_register_edit` with the changed `file::symbol` entries and
`graph_add_memory(type="decision", content="Analytics rebuilt: monthly movement + collapsible breakdown, snapshots replaced by history")`.

---

## Self-Review Notes

- Spec coverage: THIS MONTH block (T1+T3), collapsed breakdown both pages (T3+T4),
  listing health first (T4), history engine + migration + pruning (T1), wiring on all
  load paths via `launch()` (T2), honesty note <2 days (T3), visual system (T5),
  removal of snapshot/diff (T3), tests (T1, T2), CI gate already exists.
- `_restoreStore` clicks `btn-launch` → `launch()` → `recordHistory` covers restore,
  disk-link, and feed paths — no separate wiring needed.
- `renderCollapse`/`toggleCollapse` live in `analytics.js`, loaded last, but are only
  referenced at render/click time — safe.
- Old `diff-chip`/`diff-row` CSS in home.css is reused by Biggest Movers — kept.
