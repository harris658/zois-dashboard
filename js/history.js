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
