# WhatsApp Share + UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WhatsApp product sharing from cards and modals, remove the hamburger menu in favour of a header profile icon, add a last-synced timestamp chip, and add an "← Overview" back button when filters are active.

**Architecture:** All changes are additive edits to existing JS and CSS files plus targeted HTML modifications. No new files are created. New functions (`buildShareMessage`, `shareProduct`, `saveSyncTime`, `getSyncLabel`, `updateSyncChip`) are added to existing JS files that already own that responsibility. The existing `showToast` / `#toast` infrastructure is reused.

**Tech Stack:** Vanilla JS, HTML, CSS — no build step. Open `stock-dashboard.html` directly in Chrome to test.

---

## File Map

| File | Changes |
|---|---|
| `stock-dashboard.html` | Remove hamburger + nmenu DOM; add profile icon; add sync chip; add `#back-overview`; add `#os-back-overview`; add share button to modal |
| `css/shell.css` | Remove nmenu/menu-btn CSS; add profile icon, sync chip, back-overview, share icon, share button, toast styles |
| `js/state.js` | Add `currentModalProduct`, `currentModalType`, `saveSyncTime`, `getSyncLabel`, `updateSyncChip` |
| `js/tabs.js` | Remove `openNavMenu`, `closeNavMenu`, `navTo`; call `updateSyncChip()` in `switchTab` |
| `js/parse.js` | Call `saveSyncTime('store')` in `launch()` |
| `js/store-filters.js` | Show/hide `#back-overview` in `applyFilters()` and `clearFilters()` |
| `js/store-render.js` | Add share icon to card HTML; add `buildShareMessage`, `shareProduct` |
| `js/store-modal.js` | Set `currentModalProduct` + `currentModalType` in `openModal()` |
| `js/online.js` | Call `saveSyncTime('online')` in `launchOnline()`; add share icon to online cards; set `currentModalProduct` + `currentModalType` in `openOsModal()`; show/hide `#os-back-overview` in `applyOsFilters()` and `clearOsFilters()` |

---

## Task 1: Remove Hamburger — Add Profile Icon in Header

**Files:**
- Modify: `stock-dashboard.html`
- Modify: `css/shell.css`
- Modify: `js/tabs.js`

- [ ] **Step 1: Remove hamburger button from HTML**

In `stock-dashboard.html`, find and remove this entire button (lines ~36–40):
```html
    <button class="menu-btn" id="menu-btn" onclick="openNavMenu()" title="Menu" aria-label="Menu">
      <svg width="15" height="12" viewBox="0 0 15 12" fill="none" aria-hidden="true">
        <path d="M1 1h13M1 6h13M1 11h13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
```

- [ ] **Step 2: Add profile icon button in its place**

In `stock-dashboard.html`, inside `.hdr-actions` div, add a new profile button **before** the sync-btn:
```html
    <button class="profile-btn" id="profile-btn" onclick="switchTab('profile')" title="Data Sources" aria-label="Data Sources">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2 13c0-2.5 1.8-4 6-4s6 1.5 6 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="8" cy="5.5" r="2.8" stroke="currentColor" stroke-width="1.4"/>
      </svg>
    </button>
```

The `.hdr-actions` block should now read:
```html
  <div class="hdr-actions">
    <button class="profile-btn" id="profile-btn" onclick="switchTab('profile')" title="Data Sources" aria-label="Data Sources">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2 13c0-2.5 1.8-4 6-4s6 1.5 6 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="8" cy="5.5" r="2.8" stroke="currentColor" stroke-width="1.4"/>
      </svg>
    </button>
    <button class="sync-btn" id="sync-btn" onclick="syncFromDisk()" title="Sync latest from disk">
      ...existing sync button SVG...
    </button>
    <button class="settings-btn" onclick="openSettings()" title="Column settings" aria-label="Column settings">
      ...existing settings button SVG...
    </button>
  </div>
```

- [ ] **Step 3: Remove nmenu DOM from HTML**

In `stock-dashboard.html`, find and remove the entire nmenu overlay and drawer (lines ~352–372):
```html
<div class="nmenu-overlay" id="nmenu-overlay" onclick="closeNavMenu()"></div>
<div class="nmenu" id="nmenu">
  ...entire block...
</div>
```

- [ ] **Step 4: Remove nmenu CSS from shell.css**

In `css/shell.css`, remove these CSS blocks entirely (they cover lines 14–112):
- `/* ── Nav Menu Drawer (left side) ─── */` section (`.nmenu-overlay`, `.nmenu`, `.nmenu-hdr`, `.nmenu-nav`, `.nmenu-section-label`, `.nmenu-item`, `.nmenu-item:hover`, `.nmenu-item.active`, `.nmenu-item svg`)
- `/* ── Menu button ─── */` section (`.menu-btn`, `.menu-btn:hover`)

- [ ] **Step 5: Add profile icon button CSS to shell.css**

In `css/shell.css`, add after the `.settings-btn:hover` rule:
```css
/* ── Profile icon button ─────────────────────────────────── */
.profile-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mid);
  flex-shrink: 0;
  transition: background .15s, border-color .15s, color .15s;
}
.profile-btn:hover {
  background: var(--bg2);
  border-color: var(--tan);
  color: var(--br);
}
.profile-btn.active {
  background: var(--br-tint);
  border-color: var(--br);
  color: var(--br);
}
```

- [ ] **Step 6: Remove openNavMenu / closeNavMenu / navTo from tabs.js**

In `js/tabs.js`, delete the entire nav menu section (the three functions):
```js
// ── Nav menu ────────────────────────────────────────────────────────────────
function openNavMenu() { ... }
function closeNavMenu() { ... }
function navTo(name) { ... }
```

- [ ] **Step 7: Highlight profile button when active**

In `js/tabs.js`, update `switchTab` to also toggle `.active` on the profile button:
```js
function switchTab(name) {
  activeTab = name;
  TAB_CONFIG.forEach(tab => {
    const pane = document.getElementById(tab.pane);
    if (pane) pane.style.display = tab.id === name ? tab.displayValue : 'none';
    const nav = document.getElementById(tab.navItem);
    if (nav) nav.classList.toggle('active', tab.id === name);
  });
  // Profile button highlight
  const profBtn = document.getElementById('profile-btn');
  if (profBtn) profBtn.classList.toggle('active', name === 'profile');
  const active = TAB_CONFIG.find(t => t.id === name);
  if (active && typeof active.onShow === 'function') active.onShow();
}
```

- [ ] **Step 8: Verify in browser**

Open `stock-dashboard.html` in Chrome. Confirm:
- No hamburger button in header
- A person-silhouette icon appears in header right side
- Clicking it opens the Profile/Data Sources tab
- Icon gets a tinted border when Profile tab is active
- Store Stock / Online Stock pills still switch tabs correctly

- [ ] **Step 9: Commit**

```bash
git add stock-dashboard.html css/shell.css js/tabs.js
git commit -m "feat: replace hamburger menu with profile icon in header"
```

---

## Task 2: Last Synced Timestamp Chip

**Files:**
- Modify: `stock-dashboard.html`
- Modify: `js/state.js`
- Modify: `js/tabs.js`
- Modify: `js/parse.js`
- Modify: `js/online.js`
- Modify: `css/shell.css`

- [ ] **Step 1: Add sync chip element to HTML**

In `stock-dashboard.html`, inside the `.hdr-actions` div, add the chip **before** the profile-btn:
```html
    <span class="sync-chip" id="sync-chip" style="display:none"></span>
```

So `.hdr-actions` now begins with:
```html
  <div class="hdr-actions">
    <span class="sync-chip" id="sync-chip" style="display:none"></span>
    <button class="profile-btn" ...>
```

- [ ] **Step 2: Add sync timestamp helpers to state.js**

At the end of `js/state.js`, append:
```js
// ── Sync timestamp ────────────────────────────────────────────────────────
function saveSyncTime(tab) {
  localStorage.setItem('zois_sync_' + tab, new Date().toISOString());
  updateSyncChip();
}

function getSyncLabel(tab) {
  const iso = localStorage.getItem('zois_sync_' + tab);
  if (!iso) return null;
  const d   = new Date(iso);
  const now = new Date();
  const ms  = now - d;
  if (ms < 86400000) {
    return 'Synced ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  if (ms < 172800000) return 'Synced yesterday';
  return 'Synced ' + d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function updateSyncChip() {
  const chip  = document.getElementById('sync-chip');
  if (!chip) return;
  const label = getSyncLabel(activeTab);
  chip.textContent = label || '';
  chip.style.display = label ? '' : 'none';
}
```

- [ ] **Step 3: Call updateSyncChip in switchTab**

In `js/tabs.js`, at the end of `switchTab()`, before the closing `}`, add:
```js
  updateSyncChip();
```

Full updated `switchTab`:
```js
function switchTab(name) {
  activeTab = name;
  TAB_CONFIG.forEach(tab => {
    const pane = document.getElementById(tab.pane);
    if (pane) pane.style.display = tab.id === name ? tab.displayValue : 'none';
    const nav = document.getElementById(tab.navItem);
    if (nav) nav.classList.toggle('active', tab.id === name);
  });
  const profBtn = document.getElementById('profile-btn');
  if (profBtn) profBtn.classList.toggle('active', name === 'profile');
  const active = TAB_CONFIG.find(t => t.id === name);
  if (active && typeof active.onShow === 'function') active.onShow();
  updateSyncChip();
}
```

- [ ] **Step 4: Call saveSyncTime in launch() in parse.js**

In `js/parse.js`, in the `launch()` function, add `saveSyncTime('store');` right after `renderHomeDashboard();`:
```js
  buildFilters();
  renderHomeDashboard();
  saveSyncTime('store');          // ← add this line
  document.getElementById('s-total').textContent = products.length;
  computeDiff();
```

- [ ] **Step 5: Call saveSyncTime in launchOnline() in online.js**

In `js/online.js`, in `launchOnline()`, add `saveSyncTime('online');` right after `updateOsStats(...)`:
```js
    updateOsStats(onlineProducts.length, onlineProducts.length);
    saveSyncTime('online');        // ← add this line
    document.getElementById('os-btn-clear').style.display = 'none';
```

- [ ] **Step 6: Add sync chip CSS to shell.css**

In `css/shell.css`, after the `.profile-btn.active` rule, add:
```css
/* ── Sync chip ───────────────────────────────────────────── */
.sync-chip {
  font-size: 11px;
  font-weight: 500;
  color: var(--light);
  white-space: nowrap;
  padding: 0 4px;
}
```

- [ ] **Step 7: Verify in browser**

Open `stock-dashboard.html`. Load a store data file and launch. Confirm:
- A "Synced 3:45pm" (current time) chip appears in the header after launching
- Switching to Online tab hides the chip (no online data yet)
- Loading online data and launching shows "Synced X:XXpm" for the online tab
- Switching between tabs updates the chip to show each tab's last sync time
- Refreshing the page still shows the chip (timestamp persists in localStorage)

- [ ] **Step 8: Commit**

```bash
git add stock-dashboard.html js/state.js js/tabs.js js/parse.js js/online.js css/shell.css
git commit -m "feat: add last-synced timestamp chip to header"
```

---

## Task 3: ← Overview Back Button

**Files:**
- Modify: `stock-dashboard.html`
- Modify: `js/store-filters.js`
- Modify: `js/online.js`
- Modify: `css/shell.css`

- [ ] **Step 1: Add back-overview element to store grid HTML**

In `stock-dashboard.html`, find the `.grid-area` div (which wraps `#pgrid`):
```html
    <div class="grid-area">
      <div class="pgrid" id="pgrid"></div>
    </div>
```

Change it to:
```html
    <div class="grid-area">
      <div id="back-overview" style="display:none">
        <button class="back-overview-btn" onclick="clearFilters()">← Overview</button>
      </div>
      <div class="pgrid" id="pgrid"></div>
    </div>
```

- [ ] **Step 2: Add os-back-overview element to online grid HTML**

In `stock-dashboard.html`, find the online `#os-pgrid`. It is inside `#os-grid-wrap`. Locate the line:
```html
      <div class="pgrid" id="os-pgrid"></div>
```

And add the back button div before it:
```html
      <div id="os-back-overview" style="display:none">
        <button class="back-overview-btn" onclick="clearOsFilters()">← Overview</button>
      </div>
      <div class="pgrid" id="os-pgrid"></div>
```

- [ ] **Step 3: Show/hide #back-overview in applyFilters() and clearFilters()**

In `js/store-filters.js`, in `applyFilters()`, find:
```js
  const hasFilters = q || cat || sz || col || priceRange;
  document.getElementById('btn-clear').style.display = hasFilters ? '' : 'none';
```

Add the back-overview toggle right after:
```js
  const hasFilters = q || cat || sz || col || priceRange;
  document.getElementById('btn-clear').style.display = hasFilters ? '' : 'none';
  document.getElementById('back-overview').style.display = hasFilters ? '' : 'none';
```

In `js/store-filters.js`, in `clearFilters()`, find:
```js
  document.getElementById('btn-clear').style.display = 'none';
```

Add after it:
```js
  document.getElementById('back-overview').style.display = 'none';
```

- [ ] **Step 4: Show/hide #os-back-overview in online filters**

In `js/online.js`, find `applyOsFilters()`. Locate where `os-btn-clear` is shown/hidden:
```js
  document.getElementById('os-btn-clear').style.display = hasOsFilters ? '' : 'none';
```

Add right after:
```js
  document.getElementById('os-back-overview').style.display = hasOsFilters ? '' : 'none';
```

In `js/online.js`, find `clearOsFilters()`. Locate where `os-btn-clear` is hidden:
```js
  document.getElementById('os-btn-clear').style.display = 'none';
```

Add right after:
```js
  document.getElementById('os-back-overview').style.display = 'none';
```

- [ ] **Step 5: Add back-overview CSS to shell.css**

In `css/shell.css`, after the `.sync-chip` rule, add:
```css
/* ── Back to overview link ───────────────────────────────── */
#back-overview,
#os-back-overview {
  padding: 8px 24px 0;
}

.back-overview-btn {
  background: none;
  border: none;
  font-family: var(--sans);
  font-size: 12.5px;
  font-weight: 500;
  color: var(--mid);
  cursor: pointer;
  padding: 0;
  transition: color .15s;
}
.back-overview-btn:hover { color: var(--br); }
```

- [ ] **Step 6: Verify in browser**

Load store data. Confirm:
- Home dashboard shows, no "← Overview" visible
- Type in the search box → "← Overview" appears above the product grid
- Click "← Overview" → filters clear, home dashboard returns, "← Overview" disappears
- Click a price band → "← Overview" appears, click it → returns to home
- Same test on the Online tab with status filter

- [ ] **Step 7: Commit**

```bash
git add stock-dashboard.html js/store-filters.js js/online.js css/shell.css
git commit -m "feat: add overview back button when filters are active"
```

---

## Task 4: WhatsApp Share Helpers

**Files:**
- Modify: `js/store-render.js`
- Modify: `js/state.js`
- Modify: `css/shell.css`

- [ ] **Step 1: Add currentModalProduct tracking to state.js**

In `js/state.js`, after the existing state variable declarations, add:
```js
// ── Modal product reference (used by share) ───────────────────────────────
let currentModalProduct  = null;
let currentModalType     = 'store'; // 'store' | 'online'
```

- [ ] **Step 2: Add buildShareMessage to store-render.js**

At the top of `js/store-render.js` (after the existing comments), add:
```js
// ── WhatsApp share helpers ────────────────────────────────────────────────
function buildShareMessage(code, name, price, availSizes) {
  const lines = [];
  lines.push(name ? 'ZOIS — ' + name + ' (' + code + ')' : 'ZOIS — ' + code);
  if (availSizes.length) lines.push('Available sizes: ' + availSizes.join(' · '));
  if (price)             lines.push('MRP: ₹' + price);
  lines.push('');
  lines.push('Store hours: Mon–Sat 11:30am–8:30pm · Sun 12:30pm–7pm');
  return lines.join('\n');
}

async function shareProduct(code, name, price, availSizes) {
  const msg = buildShareMessage(code, name, price, availSizes);
  const url = 'https://wa.me/?text=' + encodeURIComponent(msg);

  const imgs = getImg(code);
  if (imgs && imgs.length) {
    try {
      const res  = await fetch(imgs[0]);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      showToast('Image copied · Opening WhatsApp…');
    } catch(_) {
      showToast('Opening WhatsApp…');
    }
  } else {
    showToast('Opening WhatsApp…');
  }

  window.open(url, '_blank');
}
```

- [ ] **Step 3: Add toast CSS to shell.css**

In `css/shell.css`, after the `.back-overview-btn:hover` rule, add:
```css
/* ── Toast notification ──────────────────────────────────── */
#toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(12px);
  background: rgba(26,13,4,.88);
  color: #fff;
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 500;
  padding: 9px 18px;
  border-radius: 20px;
  opacity: 0;
  pointer-events: none;
  transition: opacity .2s, transform .2s;
  white-space: nowrap;
  z-index: 600;
}
#toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
```

- [ ] **Step 4: Verify showToast works**

Open browser console on `stock-dashboard.html`. Run:
```js
showToast('Test message')
```
Expected: a pill toast appears at the bottom for 2.5s then fades. If `showToast` errors as undefined, search the codebase for its definition:
```bash
grep -n "function showToast" js/*.js
```
If missing, add this to the **bottom** of `js/state.js`:
```js
function showToast(msg, duration) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), duration || 2500);
}
```

- [ ] **Step 5: Commit**

```bash
git add js/store-render.js js/state.js css/shell.css
git commit -m "feat: add WhatsApp share helpers and toast CSS"
```

---

## Task 5: Share Icon on Store Product Cards

**Files:**
- Modify: `js/store-render.js`
- Modify: `css/shell.css` (or `css/grid.css`)

- [ ] **Step 1: Add share icon to card HTML in renderGrid()**

In `js/store-render.js`, find the `renderGrid()` function. Locate where `card.innerHTML` is set:
```js
    card.innerHTML = imgHTML +
      '<div class="card-body">' +
        '<div class="card-code">' + escHtml(p.code) + '</div>' +
        (sub ? '<div class="card-sub">' + escHtml(sub) + '</div>' : '') +
        '<div class="chips">' + (chips || '<span style="font-size:11px;color:var(--mid)">No sizes available</span>') + '</div>' +
      '</div>';
```

Replace with (adds the share icon button at the bottom of `.card-body`):
```js
    const availSizes = sizeCols.filter(s => p.sizes[s] > 0);
    card.innerHTML = imgHTML +
      '<div class="card-body">' +
        '<div class="card-code">' + escHtml(p.code) + '</div>' +
        (sub ? '<div class="card-sub">' + escHtml(sub) + '</div>' : '') +
        '<div class="chips">' + (chips || '<span style="font-size:11px;color:var(--mid)">No sizes available</span>') + '</div>' +
        '<button class="card-share-btn" title="Share on WhatsApp" aria-label="Share on WhatsApp" ' +
          'onclick="event.stopPropagation();shareProduct(' +
            JSON.stringify(p.code) + ',' +
            JSON.stringify(p.name || '') + ',' +
            JSON.stringify(p.price || '') + ',' +
            JSON.stringify(availSizes) +
          ')">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>' +
            '<path d="M11.9 0C5.338 0 0 5.338 0 11.9c0 2.1.553 4.07 1.518 5.773L.044 23.387a.5.5 0 0 0 .62.62l5.714-1.474A11.858 11.858 0 0 0 11.9 23.8C18.462 23.8 23.8 18.462 23.8 11.9S18.462 0 11.9 0zm0 21.8a9.858 9.858 0 0 1-5.14-1.446.5.5 0 0 0-.363-.06l-4.173 1.077 1.077-4.173a.5.5 0 0 0-.06-.363A9.858 9.858 0 0 1 1.9 11.9C1.9 6.44 6.44 1.9 11.9 1.9S21.9 6.44 21.9 11.9 17.36 21.8 11.9 21.8z"/>' +
          '</svg>' +
        '</button>' +
      '</div>';
```

- [ ] **Step 2: Add card share button CSS**

In `css/shell.css`, after the toast block, add:
```css
/* ── Card share button ───────────────────────────────────── */
.card-body {
  position: relative;
}
.card-share-btn {
  position: absolute;
  bottom: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: #25D366;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  opacity: 0.85;
  transition: opacity .15s, transform .15s;
  flex-shrink: 0;
}
.card-share-btn:hover {
  opacity: 1;
  transform: scale(1.08);
}
```

- [ ] **Step 3: Verify in browser**

Load store data and launch. Confirm:
- Each product card shows a small green WhatsApp circle button at the bottom-right of the card body
- Clicking it does NOT open the product modal (event.stopPropagation works)
- Clicking it copies an image to clipboard (if images are loaded) and opens WhatsApp in a new tab with a pre-filled message in the format: `ZOIS — Name (Code)\nAvailable sizes: M · L\nMRP: ₹3500\n\nStore hours: Mon–Sat...`
- Toast appears at the bottom of the screen

- [ ] **Step 4: Commit**

```bash
git add js/store-render.js css/shell.css
git commit -m "feat: add WhatsApp share icon to store product cards"
```

---

## Task 6: Share Button in Store Modal

**Files:**
- Modify: `stock-dashboard.html`
- Modify: `js/store-modal.js`
- Modify: `css/modal.css` or `css/shell.css`

- [ ] **Step 1: Add share button to modal HTML**

In `stock-dashboard.html`, find the product modal `.mbox` div. Currently the `.mbody` ends with `</div>` after `#os-size-table`. Add a share button after `#os-size-table`:
```html
      <div id="os-size-table" style="display:none"></div>
      <button class="modal-share-btn" id="modal-share-btn" onclick="modalShareProduct()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M11.9 0C5.338 0 0 5.338 0 11.9c0 2.1.553 4.07 1.518 5.773L.044 23.387a.5.5 0 0 0 .62.62l5.714-1.474A11.858 11.858 0 0 0 11.9 23.8C18.462 23.8 23.8 18.462 23.8 11.9S18.462 0 11.9 0zm0 21.8a9.858 9.858 0 0 1-5.14-1.446.5.5 0 0 0-.363-.06l-4.173 1.077 1.077-4.173a.5.5 0 0 0-.06-.363A9.858 9.858 0 0 1 1.9 11.9C1.9 6.44 6.44 1.9 11.9 1.9S21.9 6.44 21.9 11.9 17.36 21.8 11.9 21.8z"/>
        </svg>
        Share on WhatsApp
      </button>
```

- [ ] **Step 2: Set currentModalProduct in openModal()**

In `js/store-modal.js`, in `openModal(p)`, add these two lines right at the top of the function body:
```js
function openModal(p) {
  currentModalProduct = p;           // ← add
  currentModalType    = 'store';     // ← add
  renderCarousel(getImg(p.code) || [], p.code);
  ...rest of function unchanged...
```

- [ ] **Step 3: Add modalShareProduct() to store-modal.js**

At the bottom of `js/store-modal.js`, add:
```js
function modalShareProduct() {
  if (!currentModalProduct) return;
  const p = currentModalProduct;
  if (currentModalType === 'store') {
    const availSizes = sizeCols.filter(s => p.sizes[s] > 0);
    shareProduct(p.code, p.name || '', p.price || '', availSizes);
  } else {
    // online product: p.baseCode, p.sizes = [{size, expected, actual}]
    const availSizes = (p.sizes || []).filter(s => s.actual > 0).map(s => s.size);
    shareProduct(p.baseCode, p.category || '', '', availSizes);
  }
}
```

- [ ] **Step 4: Add modal share button CSS**

In `css/shell.css`, after the `.card-share-btn:hover` rule, add:
```css
/* ── Modal share button ──────────────────────────────────── */
.modal-share-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 16px;
  padding: 11px 0;
  background: #25D366;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-family: var(--sans);
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s;
}
.modal-share-btn:hover { background: #1ebe5d; }
```

- [ ] **Step 5: Verify in browser**

Load store data and launch. Click any product card to open the modal. Confirm:
- A green "Share on WhatsApp" button appears at the bottom of the modal
- Clicking it copies the image (if available) and opens WhatsApp with the correct pre-filled message
- Toast appears
- Modal stays open (share does not close the modal)

- [ ] **Step 6: Commit**

```bash
git add stock-dashboard.html js/store-modal.js css/shell.css
git commit -m "feat: add WhatsApp share button to product modal"
```

---

## Task 7: Share on Online Cards and Online Modal

**Files:**
- Modify: `js/online.js`

- [ ] **Step 1: Add share icon to online card HTML**

In `js/online.js`, find the function that builds online card HTML (look for where `card.innerHTML` or card HTML string is constructed with `card-body`, `card-code`, `card-sub`, `chips`). It will look similar to:
```js
      card.innerHTML = imgHTML +
        '<div class="card-body">' +
          '<div class="card-code">' + escHtml(p.baseCode) + '</div>' +
          (p.category ? '<div class="card-cat">' + escHtml(p.category) + '</div>' : '') +
          (sub ? '<div class="card-sub">' + escHtml(sub) + '</div>' : '') +
          '<div class="chips">' + chips + '</div>' +
        '</div>';
```

Replace with (add share icon — same pattern as store):
```js
      const osAvailSizes = (p.sizes || []).filter(s => s.actual > 0).map(s => s.size);
      card.innerHTML = imgHTML +
        '<div class="card-body">' +
          '<div class="card-code">' + escHtml(p.baseCode) + '</div>' +
          (p.category ? '<div class="card-cat">' + escHtml(p.category) + '</div>' : '') +
          (sub ? '<div class="card-sub">' + escHtml(sub) + '</div>' : '') +
          '<div class="chips">' + chips + '</div>' +
          '<button class="card-share-btn" title="Share on WhatsApp" aria-label="Share on WhatsApp" ' +
            'onclick="event.stopPropagation();shareProduct(' +
              JSON.stringify(p.baseCode) + ',' +
              JSON.stringify(p.category || '') + ',' +
              JSON.stringify('') + ',' +
              JSON.stringify(osAvailSizes) +
            ')">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
              '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>' +
              '<path d="M11.9 0C5.338 0 0 5.338 0 11.9c0 2.1.553 4.07 1.518 5.773L.044 23.387a.5.5 0 0 0 .62.62l5.714-1.474A11.858 11.858 0 0 0 11.9 23.8C18.462 23.8 23.8 18.462 23.8 11.9S18.462 0 11.9 0zm0 21.8a9.858 9.858 0 0 1-5.14-1.446.5.5 0 0 0-.363-.06l-4.173 1.077 1.077-4.173a.5.5 0 0 0-.06-.363A9.858 9.858 0 0 1 1.9 11.9C1.9 6.44 6.44 1.9 11.9 1.9S21.9 6.44 21.9 11.9 17.36 21.8 11.9 21.8z"/>' +
            '</svg>' +
          '</button>' +
        '</div>';
```

- [ ] **Step 2: Set currentModalProduct in openOsModal()**

In `js/online.js`, find `openOsModal(p)` and add at the top of the function body:
```js
function openOsModal(p) {
  currentModalProduct = p;           // ← add
  currentModalType    = 'online';    // ← add
  renderCarousel(getImg(p.baseCode) || [], p.baseCode);
  ...rest unchanged...
```

- [ ] **Step 3: Verify in browser**

Load online stock data and launch. Confirm:
- Online product cards show the green WhatsApp share icon
- Clicking the icon opens WhatsApp with a message showing the base code, category, and available sizes (actual > 0)
- Opening a product modal and clicking "Share on WhatsApp" shares the online product correctly
- Toast appears in both cases

- [ ] **Step 4: Commit**

```bash
git add js/online.js
git commit -m "feat: add WhatsApp share icon and modal button to online stock tab"
```

---

## Self-Review Checklist

- [x] Spec Feature 1 (WhatsApp share, card icon, modal button, copy image, wa.me link, toast) → Tasks 4, 5, 6, 7
- [x] Spec Feature 2 Fix 1 (hamburger → profile icon) → Task 1
- [x] Spec Feature 2 Fix 3 (last synced chip) → Task 2
- [x] Spec Feature 2 Fix 4 (← Overview back button) → Task 3
- [x] Spec Feature 2 Fix 2 (tab state persistence) — re-evaluated: `switchTab()` already preserves inner div state (setup vs grid). The inner divs maintain their `display` independently of the outer tab div toggle. No additional code is needed. This is confirmed by reading `switchTab()` in `tabs.js` — it only toggles the outer `#tab-store` / `#tab-online` divs.
- [x] No TBDs or placeholders in any task
- [x] `buildShareMessage` defined in Task 4, used in Tasks 5 and 6 — consistent signature `(code, name, price, availSizes)`
- [x] `shareProduct` defined in Task 4, called in Tasks 5, 6 (via `modalShareProduct`), and 7
- [x] `currentModalProduct` / `currentModalType` defined in Task 4 (state.js), set in Tasks 6 and 7, read in Task 6 (`modalShareProduct`)
- [x] `saveSyncTime` / `updateSyncChip` defined in Task 2 (state.js), called from parse.js and online.js in Task 2
- [x] `showToast` — existing function confirmed in profile.js (Task 4 Step 4 handles case where it may need to be defined)
- [x] All file paths are absolute within the project
