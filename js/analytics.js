// ── Analytics: live compute + render from products[] ──────────────────────

const N  = n => new Intl.NumberFormat('en-IN').format(n);
const Rs = n => '₹' + new Intl.NumberFormat('en-IN').format(n);

// ── Active price-range filter (cleared by clearFilters) ───────────────────
window._storePriceRange = null;

// ── Click-to-filter helpers ────────────────────────────────────────────────
function filterByStat(filterId, value) {
  const el = document.getElementById(filterId);
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event('change'));
}

function filterByPrice(label, min, max) {
  window._storePriceRange = { label, min, max };
  applyFilters();
}

// ── Compute analytics from products[] ─────────────────────────────────────
function computeStoreAnalytics() {
  if (!products.length) return null;

  let totalSKUs  = products.length;
  let totalUnits = 0;
  const catMap   = {};
  const sizeMap  = {};

  products.forEach(p => {
    const pUnits = Object.values(p.sizes).reduce((s, q) => s + q, 0);
    totalUnits += pUnits;

    // Category map (track price sum for avg MRP)
    if (p.category) {
      if (!catMap[p.category]) catMap[p.category] = { skus: 0, units: 0, priceSum: 0, priceCount: 0 };
      catMap[p.category].skus  += 1;
      catMap[p.category].units += pUnits;
      const price = parseFloat(p.price);
      if (!isNaN(price) && price > 0) {
        catMap[p.category].priceSum   += price;
        catMap[p.category].priceCount += 1;
      }
    }

    // Size map
    Object.entries(p.sizes).forEach(([sz, qty]) => {
      if (!sizeMap[sz]) sizeMap[sz] = 0;
      sizeMap[sz] += qty;
    });
  });

  // Price bands
  const hasPrices = products.some(p => p.price && !isNaN(parseFloat(p.price)));
  let bands = [];
  if (hasPrices) {
    bands = [
      { label: 'Under ₹2,000',      count: 0, min: 0,     max: 2000 },
      { label: '₹2,000 – ₹5,000',   count: 0, min: 2000,  max: 5000 },
      { label: '₹5,000 – ₹10,000',  count: 0, min: 5000,  max: 10000 },
      { label: 'Above ₹10,000',     count: 0, min: 10000, max: Infinity },
    ];
    products.forEach(p => {
      const price = parseFloat(p.price);
      if (isNaN(price)) return;
      if (price < 2000)        bands[0].count++;
      else if (price < 5000)   bands[1].count++;
      else if (price < 10000)  bands[2].count++;
      else                     bands[3].count++;
    });
  }

  return { totalSKUs, totalUnits, catMap, sizeMap, hasPrices, bands };
}

// ── Render analytics HTML string ───────────────────────────────────────────
function renderStoreAnalyticsHTML() {
  const data = computeStoreAnalytics();
  if (!data) return '';

  const { totalSKUs, totalUnits, catMap, sizeMap, hasPrices, bands } = data;

  // Category rows sorted by units desc
  const catRows = Object.entries(catMap).sort((a, b) => b[1].units - a[1].units);
  const maxCatUnits = Math.max(...catRows.map(([, v]) => v.units), 1);

  // Size bars — canonical store order
  const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  const maxSizeUnits = Math.max(...Object.values(sizeMap), 1);

  // Price band max
  const maxBandCount = Math.max(...bands.map(b => b.count), 1);

  // ── Category table rows ──
  const catTableRows = catRows.map(([catName, v]) => {
    const avgMrp = v.priceCount > 0 ? Math.round(v.priceSum / v.priceCount) : null;
    return `
            <tr onclick="filterByStat('f-cat', '${escHtml(catName)}')" style="cursor:pointer">
              <td>
                <div class="a-pt-name">${escHtml(catName)}</div>
                <div class="a-pt-bar-wrap">
                  <div class="a-pt-bar" style="width:${(v.units / maxCatUnits * 100).toFixed(1)}%"></div>
                </div>
              </td>
              <td>${N(v.skus)}</td>
              <td>${N(v.units)}</td>
              <td>${avgMrp !== null ? Rs(avgMrp) : '—'}</td>
            </tr>`;
  }).join('');

  // ── Size bar rows ──
  const sizeBarRows = SIZE_ORDER
    .filter(sz => sizeMap[sz] > 0)
    .map(sz => `
            <div class="a-bar-row" onclick="filterByStat('f-size', '${escHtml(sz)}')" style="cursor:pointer">
              <span class="a-bar-lbl">${escHtml(sz)}</span>
              <div class="a-bar-track">
                <div class="a-bar-fill" style="width:${(sizeMap[sz] / maxSizeUnits * 100).toFixed(1)}%"></div>
              </div>
              <span class="a-bar-val">${N(sizeMap[sz])}</span>
            </div>`).join('');

  // ── Price band section ──
  const priceSection = hasPrices
    ? `<div class="a-band-list">
            ${bands.map(b => `
            <div class="a-band-item" onclick="filterByPrice('${escHtml(b.label)}', ${b.min}, ${b.max === Infinity ? 'Infinity' : b.max})" style="cursor:pointer">
              <div class="a-band-meta">
                <span class="a-band-lbl">${b.label}</span>
                <span class="a-band-nums">${N(b.count)} styles</span>
              </div>
              <div class="a-band-track">
                <div class="a-band-fill" style="width:${(b.count / maxBandCount * 100).toFixed(1)}%"></div>
              </div>
            </div>`).join('')}
          </div>`
    : `<p class="a-footnote">Price breakdown unavailable — price column was not mapped during upload.</p>`;

  return `<div class="home-section">

    <div class="a-kpi-row">
      <div class="a-kpi hi">
        <div class="a-kpi-label">Total SKUs</div>
        <div class="a-kpi-val">${N(totalSKUs)}</div>
        <div class="a-kpi-sub">unique item codes</div>
      </div>
      <div class="a-kpi">
        <div class="a-kpi-label">Units In Stock</div>
        <div class="a-kpi-val">${N(totalUnits)}</div>
        <div class="a-kpi-sub">pieces on Ginesys</div>
      </div>
    </div>

    <div class="a-two-col">

      <div class="a-card">
        <div class="a-card-title">By Product Category</div>
        <table class="a-prod-table">
          <thead><tr><th>Category</th><th>SKUs</th><th>Units</th><th>Avg MRP</th></tr></thead>
          <tbody>${catTableRows}
          </tbody>
        </table>
      </div>

      <div class="a-right-stack">

        <div class="a-card">
          <div class="a-card-title">Unique Styles By Size</div>
          <div class="a-bar-list">${sizeBarRows}
          </div>
        </div>

        <div class="a-card">
          <div class="a-card-title">Price Bands — Unique Styles</div>
          ${priceSection}
        </div>

      </div>
    </div>
  </div>`;
}

// ── Online Analytics: filter helpers ──────────────────────────────────────
function filterOsByStat(filterId, value) {
  const el = document.getElementById(filterId);
  if (!el) return;
  el.value = value;
  applyOsFilters();
}

function filterOsByStatus(value) {
  const el = document.getElementById('os-f-status');
  if (!el) return;
  el.value = value;
  applyOsFilters();
}

// ── Online Analytics: compute ──────────────────────────────────────────────
function computeOsAnalytics() {
  if (!onlineProducts || !onlineProducts.length) return null;

  let totalSKUs    = onlineProducts.length;
  let totalActual  = 0;
  let totalExpected = 0;
  const catMap  = {};
  const sizeMap = {};

  onlineProducts.forEach(p => {
    const pActual   = p.sizes.reduce((s, sz) => s + sz.actual,   0);
    const pExpected = p.sizes.reduce((s, sz) => s + sz.expected, 0);
    totalActual   += pActual;
    totalExpected += pExpected;

    if (p.category) {
      if (!catMap[p.category]) catMap[p.category] = { skus: 0, actual: 0, expected: 0 };
      catMap[p.category].skus++;
      catMap[p.category].actual   += pActual;
      catMap[p.category].expected += pExpected;
    }

    p.sizes.forEach(s => {
      if (!s.size) return;
      if (!sizeMap[s.size]) sizeMap[s.size] = 0;
      sizeMap[s.size] += s.actual;
    });
  });

  const exactMatch = onlineProducts.filter(p => p.sizes.every(s => s.diff === 0)).length;
  const withVariance = onlineProducts.filter(p => p.sizes.some(s => s.diff !== 0)).length;
  const outOfStock = onlineProducts.filter(p => p.sizes.some(s => s.actual === 0)).length;
  const variance = totalActual - totalExpected;

  return { totalSKUs, totalActual, totalExpected, variance, catMap, sizeMap, exactMatch, withVariance, outOfStock };
}

// ── Online Analytics: render ───────────────────────────────────────────────
function renderOsAnalyticsHTML() {
  const data = computeOsAnalytics();
  if (!data) return '';

  const { totalSKUs, totalActual, totalExpected, variance, catMap, sizeMap, exactMatch, withVariance, outOfStock } = data;

  const catRows = Object.entries(catMap).sort((a, b) => b[1].actual - a[1].actual);
  const hasCats = catRows.length > 1;
  const maxCatUnits = Math.max(...catRows.map(([, v]) => v.actual), 1);

  const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  const allSizes = [
    ...SIZE_ORDER.filter(s => sizeMap[s] > 0),
    ...Object.keys(sizeMap).filter(s => !SIZE_ORDER.includes(s) && sizeMap[s] > 0),
  ];
  const maxSizeUnits = Math.max(...allSizes.map(s => sizeMap[s]), 1);

  const varClass = variance === 0 ? 'ok' : variance < 0 ? 'err' : 'warn';
  const varLabel = variance === 0 ? 'perfectly balanced' : variance > 0 ? 'excess stock' : 'stock shortage';

  const catTableRows = catRows.map(([catName, v]) => {
    const accPct = v.expected > 0 ? Math.round(v.actual / v.expected * 100) : 100;
    return `<tr onclick="filterOsByStat('os-f-cat','${escHtml(catName)}')" style="cursor:pointer">
      <td>
        <div class="a-pt-name">${escHtml(catName)}</div>
        <div class="a-pt-bar-wrap"><div class="a-pt-bar" style="width:${(v.actual / maxCatUnits * 100).toFixed(1)}%"></div></div>
      </td>
      <td>${N(v.skus)}</td>
      <td>${N(v.actual)}</td>
      <td>${accPct}%</td>
    </tr>`;
  }).join('');

  const sizeBarRows = allSizes.map(sz =>
    `<div class="a-bar-row" onclick="filterOsByStat('os-f-size','${escHtml(sz)}')" style="cursor:pointer">
      <span class="a-bar-lbl">${escHtml(sz)}</span>
      <div class="a-bar-track"><div class="a-bar-fill" style="width:${(sizeMap[sz] / maxSizeUnits * 100).toFixed(1)}%"></div></div>
      <span class="a-bar-val">${N(sizeMap[sz])}</span>
    </div>`
  ).join('');

  const maxAcc = Math.max(exactMatch, withVariance, outOfStock, 1);
  const accuracySection = `<div class="a-band-list">
    <div class="a-band-item" onclick="filterOsByStatus('exact')" style="cursor:pointer">
      <div class="a-band-meta">
        <span class="a-band-lbl">Exact Match</span>
        <span class="a-band-nums">${N(exactMatch)} styles</span>
      </div>
      <div class="a-band-track"><div class="a-band-fill" style="width:${(exactMatch / maxAcc * 100).toFixed(1)}%;background:var(--ok)"></div></div>
    </div>
    <div class="a-band-item" onclick="filterOsByStatus('diff')" style="cursor:pointer">
      <div class="a-band-meta">
        <span class="a-band-lbl">Has Variance</span>
        <span class="a-band-nums">${N(withVariance)} styles</span>
      </div>
      <div class="a-band-track"><div class="a-band-fill" style="width:${(withVariance / maxAcc * 100).toFixed(1)}%;background:var(--warn)"></div></div>
    </div>
    <div class="a-band-item" onclick="filterOsByStatus('out')" style="cursor:pointer">
      <div class="a-band-meta">
        <span class="a-band-lbl">Has Out-of-Stock Size</span>
        <span class="a-band-nums">${N(outOfStock)} styles</span>
      </div>
      <div class="a-band-track"><div class="a-band-fill" style="width:${(outOfStock / maxAcc * 100).toFixed(1)}%;background:var(--err)"></div></div>
    </div>
  </div>`;

  const rightStack = `<div class="a-right-stack">
    <div class="a-card">
      <div class="a-card-title">Units By Size</div>
      <div class="a-bar-list">${sizeBarRows}</div>
    </div>
    <div class="a-card">
      <div class="a-card-title">Stock Accuracy</div>
      ${accuracySection}
    </div>
  </div>`;

  return `<div class="home-section">
    <div class="a-kpi-row-4">
      <div class="a-kpi hi">
        <div class="a-kpi-label">Total SKUs</div>
        <div class="a-kpi-val">${N(totalSKUs)}</div>
        <div class="a-kpi-sub">unique base codes</div>
      </div>
      <div class="a-kpi">
        <div class="a-kpi-label">Actual Units</div>
        <div class="a-kpi-val">${N(totalActual)}</div>
        <div class="a-kpi-sub">pieces counted</div>
      </div>
      <div class="a-kpi">
        <div class="a-kpi-label">Expected Units</div>
        <div class="a-kpi-val">${N(totalExpected)}</div>
        <div class="a-kpi-sub">per system records</div>
      </div>
      <div class="a-kpi ${varClass}">
        <div class="a-kpi-label">Variance</div>
        <div class="a-kpi-val">${variance >= 0 ? '+' : ''}${N(variance)}</div>
        <div class="a-kpi-sub">${varLabel}</div>
      </div>
    </div>

    <div class="a-two-col">
      ${hasCats ? `<div class="a-card">
        <div class="a-card-title">By Category</div>
        <table class="a-prod-table">
          <thead><tr><th>Category</th><th>SKUs</th><th>Actual</th><th>Accuracy</th></tr></thead>
          <tbody>${catTableRows}</tbody>
        </table>
      </div>` : `<div class="a-card">
        <div class="a-card-title">Units By Size</div>
        <div class="a-bar-list">${sizeBarRows}</div>
      </div>`}
      ${hasCats ? rightStack : `<div class="a-card">
        <div class="a-card-title">Stock Accuracy</div>
        ${accuracySection}
      </div>`}
    </div>
  </div>`;
}
