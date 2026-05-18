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
  ['f-color','f-cat','f-size'].forEach(id => updateSelectStyle(id));
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
  document.getElementById('btn-clear').style.display = hasFilters ? '' : 'none';
  document.getElementById('back-overview').style.display = hasFilters ? '' : 'none';

  if (!hasFilters) {
    renderPrompt();
    document.getElementById('f-count').textContent = '';
    document.getElementById('stat-shown').style.display = 'none';
    return;
  }

  const out = products.filter(p => {
    if (q && !(p.code + ' ' + p.name + ' ' + p.color).toLowerCase().includes(q)) return false;
    if (col && p.color !== col) return false;
    if (cat && p.category !== cat) return false;
    if (sz && !p.sizes[sz]) return false;
    if (priceRange) {
      const price = parseFloat(p.price);
      if (isNaN(price) || price < priceRange.min || price >= priceRange.max) return false;
    }
    return true;
  });

  document.getElementById('stat-shown').style.display = '';
  document.getElementById('s-shown').textContent = out.length;
  document.getElementById('f-count').textContent = out.length + ' of ' + products.length + ' products';
  renderGrid(out, sz);
}
