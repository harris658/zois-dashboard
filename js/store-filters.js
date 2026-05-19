window._storeSort = null;

const STORE_SORT_OPTIONS = [
  { field: 'units', dir: 'desc', label: 'Units — High to Low' },
  { field: 'units', dir: 'asc',  label: 'Units — Low to High' },
  { field: 'price', dir: 'desc', label: 'Price — High to Low' },
  { field: 'price', dir: 'asc',  label: 'Price — Low to High' },
  { field: 'code',  dir: 'asc',  label: 'Code — A to Z' },
];

function toggleSortPanel() {
  const panel = document.getElementById('sort-panel');
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
  panel.innerHTML = STORE_SORT_OPTIONS.map(opt => {
    const active = window._storeSort &&
      window._storeSort.field === opt.field &&
      window._storeSort.dir   === opt.dir;
    return '<button class="sort-option' + (active ? ' active' : '') + '" ' +
      'onclick="selectSort(\'' + opt.field + '\',\'' + opt.dir + '\')">' +
      opt.label + '</button>';
  }).join('');
  panel.style.display = 'block';
}

function selectSort(field, dir) {
  const isActive = window._storeSort &&
    window._storeSort.field === field &&
    window._storeSort.dir   === dir;
  window._storeSort = isActive ? null : { field, dir };
  document.getElementById('sort-panel').style.display = 'none';
  document.getElementById('btn-sort').classList.toggle('active', !!window._storeSort);
  applyFilters();
}

document.addEventListener('click', e => {
  if (!document.getElementById('btn-sort')?.closest('.sort-wrap')?.contains(e.target)) {
    const p = document.getElementById('sort-panel');
    if (p) p.style.display = 'none';
  }
  if (!document.getElementById('os-btn-sort')?.closest('.sort-wrap')?.contains(e.target)) {
    const p = document.getElementById('os-sort-panel');
    if (p) p.style.display = 'none';
  }
});

// ── Filters ───────────────────────────────────────────────────────────────
function buildFilters() {
  // Reset all conditionally-hidden filter rows to visible before rebuilding
  document.getElementById('sz-row').style.display = '';
  document.getElementById('sz-div').style.display = '';
  document.getElementById('color-row').style.display = '';
  document.getElementById('color-div').style.display = '';
  document.getElementById('product-row').style.display = '';
  const _dividers = document.querySelectorAll('#filters .fdiv');
  if (_dividers[1]) _dividers[1].style.display = '';

  // Size dropdown
  const fsize = document.getElementById('f-size');
  fsize.innerHTML = '<option value="">All Sizes</option>';
  if (sizeCols.length) {
    sizeCols.forEach(s => {
      const o = document.createElement('option');
      o.value = s; o.textContent = s;
      fsize.appendChild(o);
    });
  } else {
    document.getElementById('sz-row').style.display = 'none';
    document.getElementById('sz-div').style.display = 'none';
  }

  // Color dropdown
  const colors = [...new Set(products.map(p => p.color).filter(Boolean))].sort();
  const fc = document.getElementById('f-color');
  fc.innerHTML = '<option value="">All Colors</option>';
  colors.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    fc.appendChild(o);
  });
  if (!colors.length) {
    document.getElementById('color-row').style.display = 'none';
    document.getElementById('color-div').style.display = 'none';
  }

  // Product (category) dropdown — sorted by total units desc to match analytics table order
  const catUnits = products.reduce((acc, p) => {
    if (p.category) {
      acc[p.category] = (acc[p.category] || 0) +
        Object.values(p.sizes).reduce((s, q) => s + q, 0);
    }
    return acc;
  }, {});
  const cats = Object.keys(catUnits).sort((a, b) => catUnits[b] - catUnits[a]);
  const fcat = document.getElementById('f-cat');
  fcat.innerHTML = '<option value="">All</option>';
  cats.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    fcat.appendChild(o);
  });
  if (!cats.length) {
    document.getElementById('product-row').style.display = 'none';
    // hide the divider after product row too
    const divs = document.querySelectorAll('#filters .fdiv');
    if (divs[1]) divs[1].style.display = 'none';
  }
}

function updateSelectStyle(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('active', !!el.value);
}

function clearFilters() {
  document.getElementById('q').value = '';
  document.getElementById('f-color').value = '';
  document.getElementById('f-cat').value = '';
  document.getElementById('f-size').value = '';
  window._storePriceRange = null;
  window._storeSort = null;
  ['f-color','f-cat','f-size'].forEach(id => updateSelectStyle(id));
  document.getElementById('btn-sort').classList.remove('active');
  document.getElementById('sort-panel').style.display = 'none';
  renderPrompt();
  document.getElementById('btn-clear').style.display = 'none';
  document.getElementById('back-overview').style.display = 'none';
  document.getElementById('f-count').textContent = '';
  document.getElementById('stat-shown').style.display = 'none';
}

function applyFilters() {
  const q          = document.getElementById('q').value.trim().toLowerCase();
  const cat        = document.getElementById('f-cat').value;
  const sz         = document.getElementById('f-size').value;
  const col        = document.getElementById('f-color').value;
  const priceRange = window._storePriceRange || null;

  ['f-color','f-cat','f-size'].forEach(id => updateSelectStyle(id));

  const hasFilters = q || cat || sz || col || priceRange;
  const hasSort    = !!window._storeSort;
  document.getElementById('btn-clear').style.display = (hasFilters || hasSort) ? '' : 'none';
  document.getElementById('back-overview').style.display = (hasFilters || hasSort) ? '' : 'none';

  if (!hasFilters && !hasSort) {
    renderPrompt();
    document.getElementById('f-count').textContent = '';
    document.getElementById('stat-shown').style.display = 'none';
    return;
  }

  const out = hasFilters ? products.filter(p => {
    if (q && !(p.code + ' ' + p.name + ' ' + p.color).toLowerCase().includes(q)) return false;
    if (col && p.color !== col) return false;
    if (cat && p.category !== cat) return false;
    if (sz && !p.sizes[sz]) return false;
    if (priceRange) {
      const price = parseFloat(p.price);
      if (isNaN(price) || price < priceRange.min || price >= priceRange.max) return false;
    }
    return true;
  }) : products;

  document.getElementById('stat-shown').style.display = '';
  document.getElementById('s-shown').textContent = out.length;
  document.getElementById('f-count').textContent = out.length + ' of ' + products.length + ' products';
  renderGrid(out, sz);
}
