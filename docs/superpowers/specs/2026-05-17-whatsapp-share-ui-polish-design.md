# WhatsApp Share + UI Polish — Design Spec
**Date:** 2026-05-17
**Project:** ZOIS Dashboard (stock-dashboard.html)
**Status:** Approved

---

## Overview

Two features shipped together: (1) WhatsApp product sharing from the product card and modal, and (2) four targeted UI fixes that reduce navigation friction. Both touch the same parts of the interface, so shipping together is more efficient.

---

## Feature 1: WhatsApp Product Share

### Purpose
Staff receive product inquiries on WhatsApp (customers asking about availability, sizes, price). Currently staff manually note down details or screenshot Ginesys. This feature lets them share a clean, formatted product card directly from the dashboard in two taps.

### Entry Points

**Card-level share icon**
- A small WhatsApp icon rendered inside each product card, bottom-right of the card body, always visible (not hover-only — touch devices don't hover)
- Present on both Store Stock cards and Online Stock cards
- Tapping triggers the share flow

**Modal share button**
- A full-width "Share on WhatsApp" button at the bottom of the product modal (both store modal and online modal)
- Same share flow as the card icon

### Share Flow

1. **Image copy** — If the product has an image loaded, fetch it via the existing `getImg(code)` lookup, convert to a Blob, and write to clipboard using `navigator.clipboard.write()`. This is silent — no dialog, no confirmation prompt.
2. **WhatsApp open** — Open `https://wa.me/?text=<encoded>` in a new tab. WhatsApp desktop app or WhatsApp Web picks this up.
3. **Toast feedback** — A brief toast at the bottom of the screen: "Image copied · Opening WhatsApp…" (2.5s, then fades). If no image was available: "Opening WhatsApp…"

If the browser does not support `navigator.clipboard.write()` (e.g. non-HTTPS context), skip the clipboard step silently and proceed to open WhatsApp. No error shown to user.

### Message Format

```
ZOIS — {Product Name} ({Code})
Available sizes: {Size1} · {Size2} · {Size3}
MRP: ₹{Price}

Store hours: Mon–Sat 11:30am–8:30pm · Sun 12:30pm–7pm
```

**Rules:**
- Sizes listed are only those with qty > 0 (available sizes, not all sizes)
- If price is not in the data, omit the MRP line entirely
- If product name is absent, use the code alone: `ZOIS — KS-2341`
- Message is URL-encoded before appending to the wa.me link

### Data Sources
- Product name, code, price: from `p.name`, `p.code`, `p.price` (store) / `p.baseCode`, `p.category` (online)
- Available sizes: `sizeCols.filter(s => p.sizes[s] > 0)` (store) / size chips already rendered (online)
- Image: `getImg(p.code)` — first image in the array, or null

### Files Affected
- `js/store-render.js` — add share icon to card HTML, add share button to modal
- `js/store-modal.js` — add share button to modal footer
- `js/online.js` — add share icon to online card HTML, add share button to online modal
- `js/analytics.js` — no changes needed
- New helper: `buildShareMessage(p, availSizes)` — pure function, added to `store-render.js`
- New helper: `shareProduct(p, availSizes)` — orchestrates clipboard write + wa.me open + toast, also added to `store-render.js`
- CSS: add `.share-icon`, `.share-btn`, `.share-toast` styles (in `shell.css` or `modal.css`)

---

## Feature 2: UI Polish

### Fix 1 — Profile Icon in Header (remove hamburger)

**Problem:** The hamburger menu (≡) exists solely to access the Profile tab. It's non-obvious and adds a tap.

**Solution:**
- Remove the hamburger button (`#menu-btn`) and the slide-out nav menu (`#nmenu`, `#nmenu-overlay`) from the HTML
- Add a person icon button (◯) in the header, right side, next to the existing sync button
- Tapping it calls `switchTab('profile')` directly
- Profile tab pill is not shown in the main tab pills (Store / Online) — it's accessed only via the header icon, keeping the pill bar clean

**Files:** `stock-dashboard.html`, `js/tabs.js` (remove `openNavMenu`, `closeNavMenu`, `navTo` functions), `css/shell.css`

---

### Fix 2 — Tab State Persistence

**Problem:** Switching between Store and Online tabs can drop the user back to the upload/setup screen even when data is already loaded.

**Solution:**
- Track loaded state per tab in a boolean flag: `storeLoaded` and `onlineLoaded` (already partially exists as product array length checks)
- In `switchTab()`, when switching to a tab that is already loaded, ensure the grid wrapper is shown and the setup screen is hidden — never reset on tab switch
- The setup/upload screen only appears when `storeLoaded === false` / `onlineLoaded === false`
- "↩ Change data" button explicitly sets the flag to false and shows setup

**Files:** `js/tabs.js`, `js/state.js`

---

### Fix 3 — Last Synced Timestamp in Header

**Problem:** No indication of whether the displayed data is fresh or stale.

**Solution:**
- After any file upload or disk sync, save a timestamp to `localStorage` keyed per tab (`zois_store_synced`, `zois_online_synced`)
- Render a small grey chip in the header: `Synced 3:45pm` (same day) or `Synced yesterday` / `Synced May 15` (older)
- Chip updates live when a new file is loaded or sync runs
- If no timestamp exists (first load), chip is hidden

**Files:** `stock-dashboard.html` (chip element in header), `js/state.js` or `js/idb.js` (timestamp save), `css/shell.css` (chip style)

---

### Fix 4 — "← Overview" Back Button

**Problem:** When any filter is active, the home analytics dashboard is replaced by the product grid. There is no affordance to return to the dashboard except manually clearing all filters.

**Solution:**
- When `applyFilters()` results in an active filter state (search query, category, size, color, or price range), show a small "← Overview" text link above the product grid
- Tapping it calls `clearFilters()` which already returns to the home dashboard
- When no filters are active (showing home dashboard), the link is hidden
- Same pattern applied to the Online tab's filter state

**Files:** `stock-dashboard.html` (add `#back-overview` element), `js/store-filters.js` (show/hide on filter apply/clear), `js/online.js` (same for online tab), `css/shell.css`

---

## Implementation Order

1. UI Fix 1 (header profile icon) — structural HTML change, do first to avoid conflicts
2. UI Fix 2 (tab state persistence) — state logic, no visual changes
3. UI Fix 3 (last synced chip) — additive, no conflicts
4. UI Fix 4 (← Overview button) — filter state hook
5. WhatsApp share helpers (`buildShareMessage`, `shareProduct`, toast)
6. Share icon on store cards + store modal button
7. Share icon on online cards + online modal button
8. CSS for share icon, share button, toast, synced chip, profile icon

---

## Out of Scope

- Real-time stock sync (requires backend)
- Sending images directly via WhatsApp API (not available without business API integration)
- Share to platforms other than WhatsApp
