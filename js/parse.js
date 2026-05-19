// ── Setup ─────────────────────────────────────────────────────────────────
const STANDARD_SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

const inpData   = document.getElementById('inp-data');
const inpImgs   = document.getElementById('inp-imgs');
const btnLaunch = document.getElementById('btn-launch');

inpData.addEventListener('change', async () => {
  const f = inpData.files[0];
  if (!f) return;
  setStatus('st-data','info','Reading…');
  try {
    await parseFile(f);
    document.getElementById('zone-data').classList.add('done');
    if (btnLaunch) btnLaunch.disabled = false;
  } catch(e) {
    setStatus('st-data','err','Error: ' + e.message);
  }
});

inpImgs.addEventListener('change', () => {
  imgMap = {};
  let n = 0;
  for (const f of inpImgs.files) {
    if (!f.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(f);
    const raw = f.name.replace(/\.[^/.]+$/, '').toLowerCase().trim();
    // Group multi-image sets: strip trailing -N / _N digit suffix (e.g. K5119EMB-2 → k5119emb)
    const key = raw.replace(/[\s\-_]+\d+$/, '').trim() || raw;
    (imgMap[key] = imgMap[key] || []).push(url);
    // Also index by code prefix — strips -RS{price} suffix (e.g. K5119EMB-RS8350 → k5119emb)
    const prefix = key.replace(/-rs\d+$/i, '');
    if (prefix !== key) {
      (imgMap[prefix] = imgMap[prefix] || []).push(url);
    }
    n++;
  }
  setStatus('st-imgs', 'ok', '✓ ' + n + ' images loaded');
  document.getElementById('zone-imgs').classList.add('done');
});

async function loadImagesFromHandle(dirHandle) {
  imgMap = {};
  let n = 0;
  for await (const [name, entry] of dirHandle.entries()) {
    if (entry.kind !== 'file') continue;
    const file = await entry.getFile();
    if (!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    const raw = name.replace(/\.[^/.]+$/, '').toLowerCase().trim();
    const key = raw.replace(/[\s\-_]+\d+$/, '').trim() || raw;
    (imgMap[key] = imgMap[key] || []).push(url);
    const prefix = key.replace(/-rs\d+$/i, '');
    if (prefix !== key) (imgMap[prefix] = imgMap[prefix] || []).push(url);
    n++;
  }
  setStatus('st-imgs', 'ok', '✓ ' + n + ' images linked');
  document.getElementById('zone-imgs').classList.add('done');
  return n;
}

async function pickImageFolder(e) {
  if (!window.showDirectoryPicker) return;
  e.preventDefault();
  e.stopPropagation();
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    await idbSave('imgs-handle', handle);
    await loadImagesFromHandle(handle);
    showToast('Image folder linked ✓ — auto-loads next time');
  } catch(err) {
    if (err.name !== 'AbortError') showToast('Error: ' + err.message);
  }
}

if (btnLaunch) btnLaunch.addEventListener('click', launch);
document.getElementById('btn-reload').addEventListener('click', () => {
  document.getElementById('store-grid').style.display = 'none';
  document.getElementById('store-setup').style.display = '';
  clearFilters();
});

function setStatus(id, cls, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = 'uz-status ' + cls;
}

// ── Snapshot & diff ───────────────────────────────────────────────────────
async function snapshotProducts() {
  if (!products.length) return;
  try {
    const existing = (await idbGet('store-snapshots')) || [];
    existing.push({ date: new Date().toISOString(), products });
    if (existing.length > 10) existing.splice(0, existing.length - 10);
    await idbSave('store-snapshots', existing);
  } catch(e) { /* silent */ }
}

async function computeDiff() {
  try {
    const snaps = await idbGet('store-snapshots');
    if (!snaps || !snaps.length) { stockDiff = null; return; }
    const prev = snaps[snaps.length - 1].products;
    const prevMap = {};
    prev.forEach(p => { prevMap[p.code] = Object.values(p.sizes || {}).reduce((a,b)=>a+b,0); });
    const diffs = [];
    products.forEach(p => {
      const newQty = Object.values(p.sizes || {}).reduce((a,b)=>a+b,0);
      const oldQty = prevMap[p.code] ?? null;
      if (oldQty !== null && newQty !== oldQty)
        diffs.push({ code: p.code, name: p.name, delta: newQty - oldQty });
    });
    diffs.sort((a,b) => Math.abs(b.delta) - Math.abs(a.delta));
    stockDiff = diffs.length ? diffs : null;
    // Refresh home dashboard if it's currently displayed
    const pgrid = document.getElementById('pgrid');
    if (pgrid && pgrid.querySelector('.home-dash')) renderHomeDashboard();
  } catch(e) { stockDiff = null; }
}

// ── Parse ─────────────────────────────────────────────────────────────────
async function parseFile(file) {
  await snapshotProducts();
  const buf = await file.arrayBuffer();
  let wb;
  if (file.name.toLowerCase().endsWith('.csv')) {
    wb = XLSX.read(new TextDecoder().decode(buf), { type: 'string' });
  } else {
    wb = XLSX.read(buf, { type: 'array' });
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  if (!rows.length) throw new Error('No rows found in file');
  allRows = rows;
  const _isoNow = new Date().toISOString();
  idbSave('store', { name: file.name, date: _isoNow, buffer: buf })
    .then(() => renderProfileStatus('store', file.name, _isoNow));
  setStatus('st-data', 'ok', '✓ ' + rows.length + ' rows loaded — match columns below');
  showMapper(rows);
}

function showMapper(rows) {
  const headers = Object.keys(rows[0]);
  const find = (pats) => headers.find(h => pats.some(p => p.test(h))) || '';
  const defaults = {
    code:  find([/^(code|sku|product.?code|article|ref|item.?no|item|style)/i]) || headers[0],
    name:  find([/^(name|product|description|title|style.?name)/i]),
    color: find([/^(colou?r)/i]),
    cat:   find([/^(cat|type|collection|gender|category|group|class)/i]),
    price: find([/^(price|mrp|rate|cost|sp)/i]),
  };
  const autoSizes = headers.filter(h => {
    const t = String(h).trim();
    return /^(3[0-9]|4[0-9]|50)$/.test(t)
      || /^(XS|S|M|L|XL|2?XL|XXL|3XL|XXXL)$/i.test(t)
      || /^(UK|US)?\s*[2-9](\.[05])?$/.test(t);
  });

  const fields = [
    { id:'map-code',  label:'Product Code', required:true,  key:'code'  },
    { id:'map-name',  label:'Name',         required:false, key:'name'  },
    { id:'map-color', label:'Color',        required:false, key:'color' },
    { id:'map-cat',   label:'Category',     required:false, key:'cat'   },
    { id:'map-price', label:'Price',        required:false, key:'price' },
  ];
  const optBlank = '<option value="">— skip —</option>';
  document.getElementById('map-rows').innerHTML = fields.map(f => {
    const opts = (f.required ? '' : optBlank) +
      headers.map(h =>
        '<option value="' + escHtml(h) + '"' + (h === defaults[f.key] ? ' selected' : '') + '>' + escHtml(h) + '</option>'
      ).join('');
    return '<div class="map-row">' +
      '<label class="map-label">' + f.label + (f.required ? ' <span class="req">*</span>' : '') + '</label>' +
      '<select class="map-sel" id="' + f.id + '">' + opts + '</select>' +
      '</div>';
  }).join('');

  document.getElementById('sz-checks').innerHTML = headers.map(h =>
    '<label class="sz-chk"><input type="checkbox" value="' + escHtml(h) + '"' +
    (autoSizes.includes(h) ? ' checked' : '') + '> ' + escHtml(h) + '</label>'
  ).join('');

  const allOpts = headers.map(h => '<option value="' + escHtml(h) + '">' + escHtml(h) + '</option>').join('');
  const sizeDefault = find([/^(size|sz|variant)/i]);
  const qtyDefault  = find([/^(qty|quantity|stock|inventory|pieces|pcs|units)/i]);
  document.getElementById('map-szcol').innerHTML = allOpts;
  document.getElementById('map-qtycol').innerHTML = allOpts;
  if (sizeDefault) document.getElementById('map-szcol').value = sizeDefault;
  if (qtyDefault)  document.getElementById('map-qtycol').value = qtyDefault;

  if (!autoSizes.length && sizeDefault) {
    document.getElementById('fmt-long').checked = true;
    toggleFmt();
  } else {
    document.getElementById('fmt-wide').checked = true;
  }

  // Auto-apply saved column settings
  const _s = loadSettings();
  if (_s && _s.store) {
    const _st = _s.store;
    const _try = (id, val) => { if (!val) return; const el=document.getElementById(id); if(el && [...el.options].some(o=>o.value===val)) el.value=val; };
    _try('map-code',_st.code); _try('map-name',_st.name); _try('map-color',_st.color); _try('map-cat',_st.cat); _try('map-price',_st.price);
    if (_st.fmt==='long') { document.getElementById('fmt-long').checked=true; toggleFmt(); _try('map-szcol',_st.szcol); _try('map-qtycol',_st.qtycol); }
    if (_st.sizes && _st.sizes.length) document.querySelectorAll('#sz-checks input').forEach(cb=>{ cb.checked=_st.sizes.includes(cb.value); });
  }
  document.getElementById('col-mapper').style.display = 'block';
}

function toggleFmt() {
  const isLong = document.getElementById('fmt-long').checked;
  document.getElementById('wide-section').style.display = isLong ? 'none' : '';
  document.getElementById('long-section').style.display = isLong ? '' : 'none';
}

function processRows(rows, codeC, nameC, colorC, catC, priceC) {
  products = rows.map((r, i) => {
    const sizes = {};
    for (const s of sizeCols) {
      const v = String(r[s] ?? '').trim();
      if (v === '' || v === '0' || /^(no|n|x|-|false|×|✗|na)$/i.test(v)) {
        sizes[s] = 0;
      } else if (/^\d+$/.test(v)) {
        sizes[s] = parseInt(v, 10);
      } else {
        sizes[s] = 1;
      }
    }
    return {
      id: i,
      code:     String(r[codeC] || '').trim(),
      name:     nameC  ? String(r[nameC]  || '').trim() : '',
      color:    colorC ? String(r[colorC] || '').trim() : '',
      category: catC   ? String(r[catC]   || '').trim() : '',
      price:    priceC ? String(r[priceC] || '').trim() : '',
      sizes,
    };
  }).filter(p => p.code);
}

function processRowsLong(rows, codeC, nameC, colorC, catC, priceC, sizeC, qtyC) {
  const groups = {};
  const order  = [];
  rows.forEach(r => {
    const code = String(r[codeC] || '').trim();
    if (!code) return;
    if (!groups[code]) {
      order.push(code);
      groups[code] = {
        code,
        name:     nameC  ? String(r[nameC]  || '').trim() : '',
        color:    colorC ? String(r[colorC] || '').trim() : '',
        category: catC   ? String(r[catC]   || '').trim() : '',
        price:    priceC ? String(r[priceC] || '').trim() : '',
        sizes: {}
      };
    }
    const sz = String(r[sizeC] || '').trim();
    if (!sz) return;
    const v = String(r[qtyC] ?? '').trim();
    const qty = (v === '' || v === '0' || /^(no|n|x|-|false|×|✗|na)$/i.test(v))
      ? 0 : (/^\d+$/.test(v) ? parseInt(v, 10) : 1);
    groups[code].sizes[sz] = (groups[code].sizes[sz] || 0) + qty;
  });

  const allSz = new Set();
  Object.values(groups).forEach(p => Object.keys(p.sizes).forEach(s => allSz.add(s)));
  sizeCols = [...allSz].sort((a, b) => {
    const na = parseFloat(a), nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  products = order.map((code, i) => ({ ...groups[code], id: i }));
}

// ── Launch ────────────────────────────────────────────────────────────────
function launch() {
  const codeC = document.getElementById('map-code').value;
  if (!codeC) { alert('Please select a Product Code column first.'); return; }

  const nameC  = document.getElementById('map-name').value  || null;
  const colorC = document.getElementById('map-color').value || null;
  const catC   = document.getElementById('map-cat').value   || null;
  const priceC = document.getElementById('map-price').value || null;

  const isLong = document.getElementById('fmt-long').checked;
  if (isLong) {
    const sizeC = document.getElementById('map-szcol').value;
    const qtyC  = document.getElementById('map-qtycol').value;
    if (!sizeC || !qtyC) { alert('Please select both Size and Qty columns for long format.'); return; }
    processRowsLong(allRows, codeC, nameC, colorC, catC, priceC, sizeC, qtyC);
  } else {
    sizeCols = [...document.querySelectorAll('#sz-checks input:checked')].map(c => c.value);
    processRows(allRows, codeC, nameC, colorC, catC, priceC);
  }

  // Restrict to standard apparel sizes only
  sizeCols = sizeCols.filter(s => STANDARD_SIZES.some(std => std.toLowerCase() === s.toLowerCase()));
  products = products.filter(p =>
    STANDARD_SIZES.some(s =>
      Object.keys(p.sizes).some(k => k.toLowerCase() === s.toLowerCase() && p.sizes[k] > 0)
    )
  );

  // Remove non-standard size keys from surviving products
  const _stdSet = new Set(sizeCols.map(s => s.toLowerCase()));
  products.forEach(p => {
    Object.keys(p.sizes).forEach(k => {
      if (!_stdSet.has(k.toLowerCase())) delete p.sizes[k];
    });
  });

  const _isLong2=document.getElementById('fmt-long').checked;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({...(loadSettings()||{}), store:{
    code: document.getElementById('map-code').value,
    name: document.getElementById('map-name').value||'',
    color:document.getElementById('map-color').value||'',
    cat:  document.getElementById('map-cat').value||'',
    price:document.getElementById('map-price').value||'',
    fmt:  _isLong2?'long':'wide',
    szcol:document.getElementById('map-szcol').value||'',
    qtycol:document.getElementById('map-qtycol').value||'',
    sizes:[...document.querySelectorAll('#sz-checks input:checked')].map(c=>c.value),
  }}));
  document.getElementById('store-setup').style.display = 'none';
  document.getElementById('store-grid').style.display = '';
  buildFilters();
  renderHomeDashboard();
  saveSyncTime('store');
  document.getElementById('s-total').textContent = products.length;
  computeDiff();
}
