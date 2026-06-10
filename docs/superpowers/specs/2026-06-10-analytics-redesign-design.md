# Analytics Redesign — Design

**Date:** 2026-06-10
**Approved scope (Harshit):** monthly movement, light online health, three-block layout
on both pages. Idle-ranked sitting stock and the restock shortlist were proposed and
**cut** — the history engine below supports adding them later without rework.

## Problem

The analytics (home view of the Store and Online tabs) shows stock *composition* —
SKU counts, category table, size bars, price bands — stacked in one scroll with no
reading order. Composition rarely drives a decision, so the page is unhelpful, and the
layout feels messy. ZOIS is a slow-rotation business (few units move per day, online
sales are small), so day-level movement views are meaningless; the right timescale is
monthly.

## Store page (home view, no filters active)

Three blocks, strict top-to-bottom order:

```
1 ▸ THIS MONTH                     sublabel: "estimated from stock changes"
    KPIs (one row, max 3): Styles moved · Units out · New arrivals  (all last 30 days)
    Biggest movers list (top 5): code, name, −N units chip — tap fills the search
    box with the code and applies filters

2 ▸ STOCK BREAKDOWN                collapsed by default, tap header to expand
    Existing content, restyled: Total SKUs / Units KPIs, category table,
    size bars, price bands. Same click-to-filter behaviour as today.

3 ▸ Hint chips                     unchanged (search by code, filter by size/colour)
```

The current "Since Last Upload" sold/returned block is **removed** — it was day-scale.
Its data source (raw snapshots) is replaced by the history engine.

## Online page (home view, no filters active)

Same three-block pattern, kept light:

```
1 ▸ LISTING HEALTH                 platform cards: Myntra · AJIO · Flipkart · Limeroad
    OOS count is the prominent number on each card (an OOS listing is a dead
    listing). Tap toggles the existing platform filter.

2 ▸ STOCK COUNT                    condensed: Actual / Expected / Variance KPI row +
    the three accuracy bands (exact match, has variance, has OOS size),
    tap-to-filter as today

3 ▸ STOCK BREAKDOWN                collapsed: category table + size bars
```

Hint chips below block 3, unchanged — same as the store page.

## History engine (new `js/history.js`)

Replaces the snapshot/diff mechanism (`snapshotProducts`, `computeDiff`, `stockDiff`,
IDB key `store-snapshots`).

- **Storage:** IDB key `store-history`:
  `{ days: { 'YYYY-MM-DD': { CODE: totalUnits, … } }, firstSeen: { CODE: 'YYYY-MM-DD' } }`
  Units only, no per-size data (sizes were only needed for the cut restock list).
- **Write:** on every successful `launch()` (covers manual upload, IDB restore, disk
  link, and the central feed). Same-day re-uploads overwrite that day's entry. Entries
  older than 35 days are pruned. `firstSeen` records the first date a code appears.
- **Migration:** on first run, existing `store-snapshots` entries are converted into
  day entries (latest snapshot per calendar day wins), then the old key is deleted.
- **Compute (`computeMonthlyMovement()`):** over the last 30 days of entries:
  - per code, sum of *negative* day-over-day unit deltas → units out (restocks/returns
    are positive deltas and are ignored, not netted)
  - styles moved = codes with units out > 0
  - new arrivals = codes whose `firstSeen` is within the window
  - biggest movers = top 5 by units out
- **Honesty:** with fewer than 2 recorded days, block 1 shows
  "Tracking started <date> — movement appears as daily updates build up."
  The block never extrapolates beyond recorded days.
- **Per-device caveat (accepted):** history is recorded per device from the data
  versions it has seen. Harshit's daily-opening device builds the full picture.
  Shipping history with the data feed is a possible later upgrade, not in scope.

## Visual system (both pages)

- One card style: soft border, consistent padding, small-caps section label row.
  No cards nested inside cards.
- Max 3 KPI numbers per row; ranked lists use two-line rows with a right-aligned
  chip (reusing the existing diff-chip look) instead of 4-column tables on mobile.
- Collapsible "Stock breakdown" uses a button-toggled section (chevron rotates),
  collapsed state persisted in `localStorage` so it stays how the user left it.
- Existing brand: Jost/Playfair fonts, `#5a2c0a` theme, existing ok/warn/err colours.
- All numbers stay tappable → filter the grid (existing `filterByStat` pattern).
- CSS: rewrite `css/analytics.css`; check the inline `<style>` block in
  `stock-dashboard.html` (lines ~24–113) for overriding rules before styling.

## What does not change

Upload, column mapper, IDB restore, disk-linked files, central data feed, LAN image
server, product grid, filters, modal, profile tab. The redesign only touches the home
views, `analytics.js`, the new `history.js`, related CSS, and removes the
snapshot/diff code that the history engine replaces.

## Error handling

- No price mapped → money figures are simply omitted (no "—" clutter).
- No category mapped → category card hidden (existing behaviour preserved).
- Corrupt/missing history → engine starts fresh; never blocks launch (try/catch,
  same silent pattern as the old snapshot code).
- XLSX with duplicate codes → totals are summed per code before storing.

## Testing

- Node unit tests (`tests/js/history.test.mjs`): day-entry building, monthly movement
  from synthetic histories (movement, restock-ignore, new arrivals, <2 days case,
  pruning, migration from old snapshot shape).
- Existing 17 node + 22 pytest tests must stay green; build test list updated for the
  new `history.js` file.
- CI gate (pytest + node) already blocks bad deploys.

## Out of scope

Idle/sitting-stock ranking, restock shortlist, history shipped via the data feed,
billing/sales data integration, separate Insights tab.
