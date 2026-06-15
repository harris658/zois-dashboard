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
  showToast('Opening WhatsApp…');
  window.open(url, '_blank');
}

async function copyProductImage(code, idx = 0, imgs) {
  if (!imgs) imgs = getImg(code);
  if (!imgs || !imgs.length) { showToast('No image to copy'); return; }
  const imgIdx = Math.min(idx, imgs.length - 1);
  try {
    // Pass a Promise to ClipboardItem so user-gesture context is preserved while fetch resolves
    const blobPromise = fetch(imgs[imgIdx]).then(r => r.blob()).then(blob =>
      new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          c.toBlob(b => b ? res(b) : rej(new Error('canvas')), 'image/png');
          URL.revokeObjectURL(img.src);
        };
        img.onerror = () => rej(new Error('load'));
        img.src = URL.createObjectURL(blob);
      })
    );
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
    showToast('Image copied ✓ — paste in WhatsApp');
  } catch(e) {
    console.error('copyProductImage failed:', e);
    showToast('Copy failed: ' + (e && e.message ? e.message : String(e)));
  }
}

// ── Size chips (shared by store + online cards) ───────────────────────────
function szChipState(qty) {
  if (qty === 0) return 'oos';
  if (qty <= 2)  return 'low';
  return 'ok';
}

function szChipHTML(size, qty, extra) {
  const cls = 'sz-chip ' + szChipState(qty) + (extra ? ' ' + escHtml(extra) : '');
  const qtyHTML = qty === 1 ? '' : '<span class="sz-qty">· ' + qty + '</span>';
  return '<span class="' + cls + '">' + escHtml(size) + qtyHTML + '</span>';
}

// ── Image lookup ──────────────────────────────────────────────────────────
// Token index per image map, built lazily on first miss — keeps grid renders
// O(1) per card instead of rescanning every filename. Loaders rebuild maps by
// reassignment (imgMap = {}), which gives a fresh index automatically.
const _imgTokenIdx = new WeakMap();

function _lookupImg(map, code) {
  const k = code.toLowerCase().trim();
  const direct = map[k]
    || map[k.replace(/[\s_-]/g,'')]
    || map[k.replace(/\s/g,'_')]
    || map[k.replace(/\s/g,'-')];
  if (direct) return direct;
  // Fallback: filenames with descriptor suffixes (e.g. 1126-PPR-XL-RS1995.jpg)
  // match when the code appears as a standalone token in the key.
  if (k.length < 2) return null;
  let idx = _imgTokenIdx.get(map);
  if (!idx) {
    idx = Object.create(null);
    for (const key in map) {
      const tokens = new Set(key.split(/[\s,_-]+/));
      for (const t of tokens) {
        if (t.length < 2) continue;
        const urls = (idx[t] = idx[t] || []);
        for (const u of map[key]) if (!urls.includes(u)) urls.push(u);
      }
    }
    _imgTokenIdx.set(map, idx);
  }
  return idx[k] || null;
}
function getImg(code)   { return _lookupImg(imgMap,   code); }
function getOsImg(code) { return _lookupImg(osImgMap, code); }

// ── Sort ──────────────────────────────────────────────────────────────────
function sortProducts(list) {
  if (!window._storeSort) return list;
  const { field, dir } = window._storeSort;
  return [...list].sort((a, b) => {
    if (field === 'code') {
      const va = a.code.toLowerCase(), vb = b.code.toLowerCase();
      return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    const va = field === 'units'
      ? Object.values(a.sizes).reduce((s, q) => s + q, 0)
      : (parseFloat(a.price) || 0);
    const vb = field === 'units'
      ? Object.values(b.sizes).reduce((s, q) => s + q, 0)
      : (parseFloat(b.price) || 0);
    return dir === 'asc' ? va - vb : vb - va;
  });
}

// ── Render ────────────────────────────────────────────────────────────────
const PH_SVG = '<svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M22 7 L13 12 L7 24 L14 27 L14 49 L42 49 L42 27 L49 24 L43 12 L34 7 Z" stroke="#6B3A1F" stroke-width="2.5" fill="none" stroke-linejoin="round"/>' +
  '<path d="M22 7 C23 10.5 33 10.5 34 7" stroke="#6B3A1F" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
  '<path d="M28 10 V30" stroke="#6B3A1F" stroke-width="2.5" stroke-linecap="round"/>' +
  '</svg>';

const PLATFORM_LABELS = { flipkart: 'Flipkart', ajio: 'AJIO', myntra: 'Myntra', limeroad: 'Limeroad' };

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
          '<div class="diff-row tappable" onclick="searchByCode(\'' + escHtml(escJs(m.code)) + '\')">' +
            '<span class="diff-code">' + escHtml(m.code) + '</span>' +
            '<span class="diff-name">' + escHtml(nameOf(m.code).slice(0, 28)) + '</span>' +
            '<span class="diff-chip sold">−' + N(m.units) + '</span>' +
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

// Cards rendered per step. The first step paints immediately; the rest are
// appended as the user scrolls, so a large catalog never blocks the main
// thread in one long synchronous task.
const GRID_BATCH = 48;
let _gridObserver = null;

function _buildCard(p, activeSz) {
  const src = (getImg(p.code) || [])[0];
  const availSz = sizeCols.filter(s => p.sizes[s] > 0);
  const chips = availSz.map(s =>
    szChipHTML(s, p.sizes[s], s === activeSz ? 'hi' : '')
  ).join('');
  const imgHTML = src
    ? '<img class="card-img" src="' + src + '" alt="' + escHtml(p.code) + '" loading="lazy">'
    : '<div class="card-ph">' + PH_SVG + '</div>';
  const sub = [p.name, p.color].filter(Boolean).join(' · ');

  const card = document.createElement('div');
  card.className = 'card';
  card.onclick = () => openModal(p);
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
          JSON.stringify(availSz) +
        ')">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
          '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>' +
          '<path d="M11.9 0C5.338 0 0 5.338 0 11.9c0 2.1.553 4.07 1.518 5.773L.044 23.387a.5.5 0 0 0 .62.62l5.714-1.474A11.858 11.858 0 0 0 11.9 23.8C18.462 23.8 23.8 18.462 23.8 11.9S18.462 0 11.9 0zm0 21.8a9.858 9.858 0 0 1-5.14-1.446.5.5 0 0 0-.363-.06l-4.173 1.077 1.077-4.173a.5.5 0 0 0-.06-.363A9.858 9.858 0 0 1 1.9 11.9C1.9 6.44 6.44 1.9 11.9 1.9S21.9 6.44 21.9 11.9 17.36 21.8 11.9 21.8z"/>' +
        '</svg>' +
      '</button>' +
    '</div>';
  return card;
}

function renderGrid(list, activeSz) {
  list = sortProducts(list);
  const grid = document.getElementById('pgrid');
  // Tear down any observer left over from a previous render (e.g. fast typing).
  if (_gridObserver) { _gridObserver.disconnect(); _gridObserver = null; }
  if (!list.length) {
    grid.innerHTML =
      '<div class="empty-state">' +
        '<h3>No products found</h3>' +
        '<p>Try adjusting your filters or search</p>' +
      '</div>';
    return;
  }
  grid.innerHTML = '';

  const renderBatch = (start, before) => {
    const frag = document.createDocumentFragment();
    const end = Math.min(start + GRID_BATCH, list.length);
    for (let i = start; i < end; i++) frag.appendChild(_buildCard(list[i], activeSz));
    if (before) grid.insertBefore(frag, before);
    else grid.appendChild(frag);
    return end;
  };

  let rendered = renderBatch(0);
  if (rendered >= list.length) return;

  // No IntersectionObserver (old browsers / non-DOM test env) → render the
  // rest in one pass so nothing is ever hidden.
  if (typeof IntersectionObserver === 'undefined') {
    while (rendered < list.length) rendered = renderBatch(rendered);
    return;
  }

  // Append the next batch each time a trailing sentinel nears the viewport.
  const sentinel = document.createElement('div');
  sentinel.style.gridColumn = '1 / -1';
  sentinel.style.height = '1px';
  grid.appendChild(sentinel);
  _gridObserver = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    rendered = renderBatch(rendered, sentinel);
    if (rendered >= list.length) {
      _gridObserver.disconnect();
      _gridObserver = null;
      sentinel.remove();
    }
  }, { rootMargin: '800px' });
  _gridObserver.observe(sentinel);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escJs(s) { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
