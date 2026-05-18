// ══════════════════════════════════════════════════════════════════════════
// ONLINE STOCK TAB
// ══════════════════════════════════════════════════════════════════════════

// ── File loading ───────────────────────────────────────────────────────────
document.getElementById('os-inp').addEventListener('change', async () => {
  const f = document.getElementById('os-inp').files[0];
  if (!f) return;
  document.getElementById('os-st').textContent = 'Reading…';
  document.getElementById('os-st').className = 'uz-status info';
  try {
    const data = await readFileData(f);
    osHeaders = data[0] ? Object.keys(data[0]).filter(k => !k.startsWith('_')) : [];
    osRawData = data;
    f.arrayBuffer().then(buf => {
      const _d = new Date().toISOString();
      idbSave('online', { name: f.name, date: _d, buffer: buf })
        .then(() => renderProfileStatus('online', f.name, _d));
    });
    const detected = detectOsCols(osHeaders);
    // Merge saved column names
    const _sv=loadSettings(); const _ov=(_sv&&_sv.online)||{};
    Object.entries(_ov).forEach(([f,sv])=>{ if(sv&&detected[f]===undefined){const m=osHeaders.find(h=>h.toLowerCase()===sv.toLowerCase()); if(m)detected[f]=m;} });
    const missing = OS_REQUIRED.filter(k => detected[k] === undefined);
    osColMap = detected;
    buildOsMapper(osHeaders, detected);
    document.getElementById('os-col-mapper').style.display = 'block';
    if (missing.length) {
      document.getElementById('os-st').textContent = 'Map the missing columns below';
      document.getElementById('os-st').className = 'uz-status info';
    } else {
      document.getElementById('os-st').textContent = '✓ ' + data.length + ' rows loaded — confirm column mapping below';
      document.getElementById('os-st').className = 'uz-status ok';
    }
    document.getElementById('os-zone').classList.add('done');
    document.getElementById('os-launch').disabled = false;
  } catch(e) {
    document.getElementById('os-st').textContent = 'Error: ' + e.message;
    document.getElementById('os-st').className = 'uz-status err';
  }
});

document.getElementById('os-inp-imgs').addEventListener('change', () => {
  imgMap = {};
  let n = 0;
  for (const f of document.getElementById('os-inp-imgs').files) {
    if (!f.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(f);
    const raw = f.name.replace(/\.[^/.]+$/, '').toLowerCase().trim();
    const key = raw.replace(/[\s\-_]+\d+$/, '').trim() || raw;
    (imgMap[key] = imgMap[key] || []).push(url);
    const prefix = key.replace(/-rs\d+$/i, '');
    if (prefix !== key) (imgMap[prefix] = imgMap[prefix] || []).push(url);
    n++;
  }
  const el = document.getElementById('os-st-imgs');
  el.textContent = '✓ ' + n + ' images loaded';
  el.className = 'uz-status ok';
  document.getElementById('os-zone-imgs').classList.add('done');
});

const OS_CATEGORY_SHEETS = ['Kurtas', 'Jackets', 'Shirts', 'Kids'];

function _parseDailyFeed(wb) {
  const dfName = wb.SheetNames.find(n => /daily.?feed/i.test(n));
  if (!dfName) return;
  const ws = wb.Sheets[dfName];
  // Sheet can have 1–3 header/title rows before the actual column names.
  // Try skipping 2, 1, or 0 rows — take the first result that has a recognisable barcode column.
  let rows = null;
  for (const skip of [2, 1, 0]) {
    const attempt = XLSX.utils.sheet_to_json(ws, {defval:'', range:skip});
    if (attempt.length && Object.keys(attempt[0]).some(h => /barcode/i.test(h))) {
      rows = attempt; break;
    }
  }
  if (!rows || !rows.length) return;
  const headers = Object.keys(rows[0]);
  const find = pat => headers.find(h => pat.test(String(h)));
  const cols = {
    barcode:  find(/our.?barcode/i) || find(/barcode/i),
    stock:    find(/\bstock\b/i),
    flipkart: find(/flipkart/i),
    ajio:     find(/ajio/i),
    myntra:   find(/myntra/i),
    limeroad: find(/limeroad/i) || find(/\blimu\b/i),
  };
  if (!cols.barcode) return;
  const platforms = ['flipkart','ajio','myntra','limeroad'];
  const stats = {};
  const psMap = {};
  platforms.forEach(p => {
    if (!cols[p]) return;
    const listed = rows.filter(r => String(r[cols[p]] || '').trim() !== '');
    const styles = new Set();
    listed.forEach(r => {
      const bc = String(r[cols.barcode] || '').trim();
      // Strip trailing size suffix to get base style code
      const base = bc.replace(/[-_](?:XXXL|XXL|XL|XS|XXS|S|M|L|FS|\d+(?:[-.]\d+)?)$/i, '') || bc;
      const key = base.toLowerCase();
      styles.add(key);
      if (!psMap[key]) psMap[key] = new Set();
      psMap[key].add(p);
    });
    const outOfStock = cols.stock
      ? listed.filter(r => +String(r[cols.stock] || '0').trim() === 0).length
      : 0;
    stats[p] = { skus: listed.length, styles: styles.size, outOfStock };
  });
  dailyFeedStats    = Object.keys(stats).length ? stats : null;
  platformStylesMap = psMap;
  // Refresh Online Stock home view if it's currently displayed
  const osPgrid = document.getElementById('os-pgrid');
  if (osPgrid && osPgrid.querySelector('.home-dash')) renderOsPrompt();
}

function parseWorkbook(wb) {
  _parseDailyFeed(wb);
  const sheets = wb.SheetNames.filter(n => OS_CATEGORY_SHEETS.includes(n));
  if (!sheets.length) {
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
  }
  const allRows = [];
  for (const sheetName of sheets) {
    const ws = wb.Sheets[sheetName];
    // range:1 skips the title row (row 1) and uses row 2 as column headers
    const rows = XLSX.utils.sheet_to_json(ws, {defval:'', range:1});
    if (!rows.length) continue;
    const sm = detectOsCols(Object.keys(rows[0]));
    rows.forEach(r => {
      r._sheet = sheetName;
      const codeB    = String(r[sm.code] || '').trim();
      const sizeRaw  = r[sm.size];
      const sizeIsDate = typeof sizeRaw === 'number' && sizeRaw > 30000;
      const colA     = String(r['__EMPTY'] || '').trim();
      // ZOIS Kids sheet layout: sizes like "2-3 years", "3-4 years", "8-10 years" are
      // stored in Excel as date serials (e.g. 46056) rather than text, because Excel
      // silently converts "2-3" to a date when the cell has no explicit format. The
      // __EMPTY col-A cell holds the base style code; the Design Number column holds
      // "<base>-<size-range>". We recover the size by slicing off the base code prefix.
      // Assumption: this layout is stable. If the Kids sheet changes (e.g. sizes stored
      // as text), sizeIsDate will be false and this branch will not fire — but the else
      // branch may produce wrong sizes. Monitor with the assertion below.
      if (sizeIsDate && colA && codeB.toUpperCase().startsWith(colA.toUpperCase() + '-')) {
        r._code = colA;
        r._size = codeB.slice(colA.length + 1); // e.g. "2-3", "3-4", "8-10"
        // Assertion: reconstructed size must look like "N-N" (digit range).
        if (!/^\d+-\d+$/.test(r._size)) {
          console.warn('[ZOIS Kids heuristic] Unexpected size value reconstructed:', r._size,
            '— sheet layout may have changed. Row:', r);
        }
      } else {
        r._code = codeB;
        r._size = String(sizeRaw || '').trim();
      }
      r._name     = String(r[sm.name]  || '').trim();
      r._color    = String(r[sm.color] || '').trim();
      r._expected = r[sm.expected];
      r._actual   = r[sm.actual];
      r._diff     = sm.diff !== undefined ? r[sm.diff] : undefined;
    });
    allRows.push(...rows);
  }
  return allRows;
}

async function readFileData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        resolve(parseWorkbook(XLSX.read(e.target.result, {type:'array'})));
      } catch(err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsArrayBuffer(file);
  });
}

function detectOsCols(headers) {
  const result = {};
  for (const [field, patterns] of Object.entries(OS_COL_PATTERNS)) {
    const match = headers.find(h => patterns.some(p => p.test(String(h))));
    if (match !== undefined) result[field] = match;
  }
  return result;
}

function buildOsMapper(headers, detected) {
  const fields = [
    ['code','Design Number *'],['name','Product Name'],['color','Color'],
    ['size','Size *'],['expected','Expected Qty *'],['actual','Actual Count *'],['diff','Difference'],
  ];
  document.getElementById('os-map-rows').innerHTML = fields.map(([k,label]) => {
    const val = detected[k] || '';
    const opts = headers.map(h => `<option value="${escHtml(h)}"${h===val?' selected':''}>${escHtml(h)}</option>`).join('');
    return `<div class="map-row">
      <span class="map-label">${label}</span>
      <select class="map-sel" data-field="${k}" onchange="osMapChange(this)">
        <option value="">— skip —</option>${opts}
      </select>
    </div>`;
  }).join('');
}

function osMapChange(sel) {
  osColMap[sel.dataset.field] = sel.value || undefined;
}

function renderOsPrompt() {
  const grid = document.getElementById('os-pgrid');
  let html = '<div class="home-dash">';

  // ── Online stock analytics (comes first, like store) ────────────────────
  if (onlineProducts && onlineProducts.length) {
    html += renderOsAnalyticsHTML();
  }

  // ── Platform listing stats ───────────────────────────────────────────────
  // When category sheets are loaded, derive counts from onlineProducts so
  // styles = unique design codes (not individual size barcodes from Daily Feed).
  if (dailyFeedStats && Object.keys(dailyFeedStats).length) {
    const useProducts = onlineProducts.length > 0 && Object.keys(platformStylesMap).length > 0;
    html += '<div class="home-section"><div class="hs-title">Platform Listings</div><div class="platform-cards">';
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
        '<div class="pc-stat"><span class="pc-num">' + styles + '</span> styles</div>' +
        '<div class="pc-skus">' + skus + ' SKUs</div>' +
        oosHtml +
        '</div>';
    });
    html += '</div></div>';
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

function launchOnline() {
  try {
    onlineProducts = groupOnlineRows(osRawData, osColMap);
    if (!onlineProducts.length) {
      buildOsMapper(osHeaders, osColMap);
      document.getElementById('os-col-mapper').style.display = 'block';
      document.getElementById('os-st').textContent = 'No products found — check the column mapping below';
      document.getElementById('os-st').className = 'uz-status err';
      document.getElementById('os-launch').disabled = false;
      return;
    }
    populateOsFilters();
    renderOsPrompt();
    document.getElementById('os-setup').style.display = 'none';
    document.getElementById('os-grid-wrap').style.display = 'flex';
    updateOsStats(onlineProducts.length, onlineProducts.length);
    saveSyncTime('online');
    document.getElementById('os-btn-clear').style.display = 'none';
    document.getElementById('os-f-count').textContent = '';
    const _on={}; Object.entries(osColMap).forEach(([f,v])=>{if(v)_on[f]=v;});
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({...(loadSettings()||{}), online:_on}));
  } catch(e) {
    document.getElementById('os-st').textContent = 'Error: ' + e.message;
    document.getElementById('os-st').className = 'uz-status err';
  }
}

// ── Data processing ────────────────────────────────────────────────────────
function extractBaseCode(designNum, size) {
  const s = (size || '').toString().toUpperCase().trim();
  const d = (designNum || '').toString().trim();
  if (s && d.toUpperCase().endsWith('-' + s)) return d.slice(0, -(s.length + 1));
  return s ? d.replace(/[-_](?:XXXL|XXL|XL|XS|XXS|L|M|S|FS|\d{1,2}(?:\.\d)?)$/i, '') : d;
}

function groupOnlineRows(rows, colMap) {
  const map = {};
  rows.forEach(r => {
    const designNum = String(r._code || r[colMap.code] || '').trim();
    const size      = String(r._size || r[colMap.size] || '').trim();
    if (!designNum) return;
    const base = extractBaseCode(designNum, size);
    const key  = base.toLowerCase();
    if (!map[key]) map[key] = {
      baseCode: base,
      name:     String(r._name  || r[colMap.name]  || '').trim(),
      color:    String(r._color || r[colMap.color]  || '').trim(),
      category: String(r._sheet || '').trim(),
      sizes: [],
    };
    const expected = +(r._expected !== undefined ? r._expected : r[colMap.expected]) || 0;
    const actual   = +(r._actual   !== undefined ? r._actual   : r[colMap.actual])   || 0;
    const diffRaw  = r._diff !== undefined ? r._diff : (colMap.diff !== undefined ? r[colMap.diff] : undefined);
    const diff     = diffRaw !== undefined ? (+diffRaw || 0) : (actual - expected);
    map[key].sizes.push({ size, expected, actual, diff });
  });
  return Object.values(map);
}

// ── Filters ────────────────────────────────────────────────────────────────
function populateOsFilters() {
  // Color
  const colors = [...new Set(onlineProducts.map(p => p.color).filter(Boolean))].sort();
  document.getElementById('os-f-color').innerHTML = '<option value="">All Colors</option>' +
    colors.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');

  // Category — hide if only 1 category (single-sheet file)
  const cats = [...new Set(onlineProducts.map(p => p.category).filter(Boolean))].sort();
  const catRow = document.getElementById('os-cat-row');
  const catDiv = document.getElementById('os-cat-fdiv');
  if (cats.length > 1) {
    document.getElementById('os-f-cat').innerHTML = '<option value="">All</option>' +
      cats.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
    catRow.style.display = ''; catDiv.style.display = '';
  } else {
    catRow.style.display = 'none'; catDiv.style.display = 'none';
  }

  // Size
  const allSizes = [...new Set(onlineProducts.flatMap(p => p.sizes.map(s => s.size)).filter(Boolean))];
  allSizes.sort((a, b) => { const na = parseFloat(a), nb = parseFloat(b); return (!isNaN(na)&&!isNaN(nb)) ? na-nb : a.localeCompare(b); });
  document.getElementById('os-f-size').innerHTML = '<option value="">All Sizes</option>' +
    allSizes.map(s => `<option value="${escHtml(s)}">${escHtml(s)}</option>`).join('');
}

function applyOsFilters() {
  const q      = document.getElementById('os-q').value.trim().toLowerCase();
  const color  = document.getElementById('os-f-color').value;
  const status = document.getElementById('os-f-status').value;
  const cat    = document.getElementById('os-f-cat').value;
  const size   = document.getElementById('os-f-size').value;
  const hasFilters = q || color || status || cat || size || osPlatformFilter;
  document.getElementById('os-btn-clear').style.display = hasFilters ? '' : 'none';
  document.getElementById('os-back-overview').style.display = hasFilters ? '' : 'none';
  if (!hasFilters) {
    renderOsPrompt();
    document.getElementById('os-f-count').textContent = '';
    updateOsStats(onlineProducts.length, onlineProducts.length);
    return;
  }
  const out = onlineProducts.filter(p => {
    if (q && !p.baseCode.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return false;
    if (color  && p.color    !== color) return false;
    if (cat    && p.category !== cat)   return false;
    if (size   && !p.sizes.some(s => s.size === size)) return false;
    if (osPlatformFilter) {
      const listed = platformStylesMap[p.baseCode.toLowerCase()];
      if (!listed || !listed.has(osPlatformFilter)) return false;
    }
    if (status) {
      const allExact = p.sizes.every(s => s.diff === 0);
      const hasOut   = p.sizes.some(s => s.actual === 0);
      const hasDiff  = p.sizes.some(s => s.diff !== 0);
      if (status === 'exact' && !allExact) return false;
      if (status === 'diff'  && !hasDiff)  return false;
      if (status === 'out'   && !hasOut)   return false;
    }
    return true;
  });
  renderOsGrid(out);
  updateOsStats(out.length, onlineProducts.length);
  document.getElementById('os-f-count').textContent = out.length + ' of ' + onlineProducts.length + ' products';
}

function clearOsFilters() {
  document.getElementById('os-q').value = '';
  document.getElementById('os-f-color').value = '';
  document.getElementById('os-f-status').value = '';
  document.getElementById('os-f-cat').value = '';
  document.getElementById('os-f-size').value = '';
  osPlatformFilter = null;
  applyOsFilters();
}

function togglePlatformFilter(platform) {
  osPlatformFilter = (osPlatformFilter === platform) ? null : platform;
  applyOsFilters();
}

function updateOsStats(shown, total) {
  document.getElementById('os-total').textContent = (total !== undefined ? total : onlineProducts.length);
  const shownEl = document.getElementById('os-stat-shown');
  if (shown !== undefined && shown !== (total !== undefined ? total : onlineProducts.length)) {
    document.getElementById('os-shown').textContent = shown;
    shownEl.style.display = '';
  } else {
    shownEl.style.display = 'none';
  }
}

// ── Render grid ────────────────────────────────────────────────────────────
function chipClass(s) {
  if (s.actual === 0 && s.expected === 0) return 'nostock';
  if (s.diff === 0) return 'exact';
  if (s.diff > 0)   return 'excess';
  return 'short';
}

function renderOsGrid(list) {
  const grid = document.getElementById('os-pgrid');
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state"><h3>No products found</h3><p>Try adjusting your filters</p></div>';
    return;
  }
  grid.innerHTML = '';
  list.forEach(p => {
    const src = (getImg(p.baseCode) || [])[0];
    const chips = p.sizes.map(s => {
      const cls = chipClass(s);
      const sign = s.diff > 0 ? '+' : '';
      return '<div class="os-chip ' + cls + '">' +
        '<div class="os-chip-sz">' + escHtml(s.size) + '</div>' +
        '<div class="os-chip-qty">' + s.actual + (s.diff !== 0 ? ' (' + sign + s.diff + ')' : '') + '</div>' +
        '</div>';
    }).join('');
    const imgHTML = src
      ? '<img class="card-img" src="' + src + '" alt="' + escHtml(p.baseCode) + '" loading="lazy">'
      : '<div class="card-ph">' + PH_SVG + '</div>';
    const sub = [p.name, p.color].filter(Boolean).join(' · ');
    const osAvailSizes = (p.sizes || []).filter(s => s.actual > 0).map(s => s.size);
    const card = document.createElement('div');
    card.className = 'card';
    card.onclick = () => openOsModal(p);
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
    grid.appendChild(card);
  });
}

// ── Online modal ───────────────────────────────────────────────────────────
function openOsModal(p) {
  currentModalProduct = p;
  currentModalType    = 'online';
  renderCarousel(getImg(p.baseCode) || [], p.baseCode);
  document.getElementById('mimg').style.display = '';
  document.getElementById('mcode').textContent = p.baseCode;
  document.getElementById('mname').textContent = p.name;
  const dets = [];
  if (p.color) dets.push(['Color', p.color]);
  document.getElementById('mdetails').innerHTML = dets.map(([l,v]) =>
    '<div class="mdet"><label>' + l + '</label><span>' + escHtml(v) + '</span></div>'
  ).join('');
  document.getElementById('msizes').style.display = 'none';
  const tbl = document.getElementById('os-size-table');
  tbl.style.display = '';
  const totExp = p.sizes.reduce((a,s) => a + s.expected, 0);
  const totAct = p.sizes.reduce((a,s) => a + s.actual, 0);
  const rows = p.sizes.map(s => {
    const cls = s.diff === 0 ? 'diff-ok' : s.diff > 0 ? 'diff-pos' : 'diff-neg';
    const sign = s.diff > 0 ? '+' : '';
    return '<tr><td>' + escHtml(s.size) + '</td><td>' + s.expected + '</td><td>' + s.actual + '</td>' +
      '<td class="' + cls + '">' + sign + s.diff + '</td></tr>';
  }).join('');
  tbl.innerHTML = '<h4 style="font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--mid);margin-bottom:10px;font-weight:600;">Online Stock</h4>' +
    '<table class="os-diff-table"><thead><tr><th>Size</th><th>Expected</th><th>Actual</th><th>Diff</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>' +
    '<p class="os-summary" style="margin-top:10px">Total: ' + totExp + ' expected · ' + totAct + ' actual</p>';
  document.getElementById('overlay').style.display = 'flex';
}
