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

async function copyProductImage(code, idx = 0) {
  const imgs = getImg(code);
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
    showToast('No image to copy');
  }
}

// ── Image lookup ──────────────────────────────────────────────────────────
function _lookupImg(map, code) {
  const k = code.toLowerCase().trim();
  return map[k]
    || map[k.replace(/[\s_-]/g,'')]
    || map[k.replace(/\s/g,'_')]
    || map[k.replace(/\s/g,'-')]
    || null;
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
const PH_SVG = '<svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="28" width="40" height="14" rx="4" fill="#6B3A1F"/><ellipse cx="17" cy="42" rx="4" ry="4" fill="#6B3A1F"/><ellipse cx="39" cy="42" rx="4" ry="4" fill="#6B3A1F"/><path d="M8 32 C14 20 28 16 44 24" stroke="#6B3A1F" stroke-width="3" fill="none" stroke-linecap="round"/></svg>';

const PLATFORM_LABELS = { flipkart: 'Flipkart', ajio: 'AJIO', myntra: 'Myntra', limeroad: 'Limeroad' };

function renderHomeDashboard() {
  const grid = document.getElementById('pgrid');
  let html = '<div class="home-dash">';

  // ── Stock changes since last upload ─────────────────────────────────────
  if (stockDiff && stockDiff.length) {
    const sold     = stockDiff.filter(d => d.delta < 0).slice(0, 5);
    const returned = stockDiff.filter(d => d.delta > 0).slice(0, 5);
    if (sold.length || returned.length) {
      html += '<div class="home-section"><div class="hs-title">Since Last Upload</div><div class="changes-cols">';

      const renderCol = (items, cls, sign) => {
        if (!items.length) return '';
        return '<div class="changes-col">' +
          '<div class="cc-label">' + (cls === 'sold' ? 'Sold' : 'Returned / Restocked') + '</div>' +
          '<div class="diff-list">' +
          items.map(d =>
            '<div class="diff-row">' +
              '<span class="diff-code">' + escHtml(d.code) + '</span>' +
              (d.name ? '<span class="diff-name">' + escHtml(d.name.slice(0,28)) + '</span>' : '') +
              '<span class="diff-chip ' + cls + '">' + sign + Math.abs(d.delta) + '</span>' +
            '</div>'
          ).join('') +
          '</div></div>';
      };

      html += renderCol(sold, 'sold', '−');
      html += renderCol(returned, 'returned', '+');
      html += '</div></div>';
    }
  }

  if (products.length) { html += renderStoreAnalyticsHTML(); }

  // ── Search hints ─────────────────────────────────────────────────────────
  html += '<div class="home-hints">' +
    '<span class="hint-chip">Search by code or name</span>' +
    '<span class="hint-chip">Filter by size</span>' +
    '<span class="hint-chip">Filter by colour</span>' +
    '</div>';

  html += '</div>';
  grid.innerHTML = html;
}

function renderPrompt() { renderHomeDashboard(); }

function renderGrid(list, activeSz) {
  list = sortProducts(list);
  const grid = document.getElementById('pgrid');
  if (!list.length) {
    grid.innerHTML =
      '<div class="empty-state">' +
        '<h3>No products found</h3>' +
        '<p>Try adjusting your filters or search</p>' +
      '</div>';
    return;
  }
  grid.innerHTML = '';
  list.forEach(p => {
    const src = (getImg(p.code) || [])[0];
    const availSz = sizeCols.filter(s => p.sizes[s] > 0);
    const chips = availSz.map(s => {
      const qty = p.sizes[s];
      const inner = qty > 1 ? s + '<span class="chip-qty"> ×' + qty + '</span>' : s;
      return '<span class="chip' + (s === activeSz ? ' hi' : '') + '">' + inner + '</span>';
    }).join('');
    const imgHTML = src
      ? '<img class="card-img" src="' + src + '" alt="' + escHtml(p.code) + '" loading="lazy">'
      : '<div class="card-ph">' + PH_SVG + '</div>';
    const sub = [p.name, p.color].filter(Boolean).join(' · ');

    const availSizes = sizeCols.filter(s => p.sizes[s] > 0);
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
            JSON.stringify(availSizes) +
          ')">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>' +
            '<path d="M11.9 0C5.338 0 0 5.338 0 11.9c0 2.1.553 4.07 1.518 5.773L.044 23.387a.5.5 0 0 0 .62.62l5.714-1.474A11.858 11.858 0 0 0 11.9 23.8C18.462 23.8 23.8 18.462 23.8 11.9S18.462 0 11.9 0zm0 21.8a9.858 9.858 0 0 1-5.14-1.446.5.5 0 0 0-.363-.06l-4.173 1.077 1.077-4.173a.5.5 0 0 0-.06-.363A9.858 9.858 0 0 1 1.9 11.9C1.9 6.44 6.44 1.9 11.9 1.9S21.9 6.44 21.9 11.9 17.36 21.8 11.9 21.8z"/>' +
          '</svg>' +
        '</button>' +
      '</div>';
    grid.appendChild(card);
  });
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
