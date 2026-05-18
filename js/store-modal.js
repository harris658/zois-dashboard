// ── Carousel ──────────────────────────────────────────────────────────────
let carouselIdx = 0;
let carouselImgs = [];

function renderCarousel(imgs, code) {
  carouselIdx = 0;
  carouselImgs = imgs;
  const mimg = document.getElementById('mimg');
  if (!imgs.length) { mimg.innerHTML = PH_SVG; return; }
  if (imgs.length === 1) {
    mimg.innerHTML = '<img src="' + imgs[0] + '" alt="' + escHtml(code) + '">';
    return;
  }
  mimg.innerHTML =
    '<button class="car-btn car-prev" onclick="carouselNav(-1)">&#8249;</button>' +
    '<img id="car-img" src="' + imgs[0] + '" alt="' + escHtml(code) + '">' +
    '<button class="car-btn car-next" onclick="carouselNav(1)">&#8250;</button>' +
    '<div class="car-dots" id="car-dots"></div>';
  renderDots(imgs.length);
}

function renderDots(n) {
  document.getElementById('car-dots').innerHTML =
    Array.from({length: n}, (_, i) =>
      '<span class="car-dot' + (i === 0 ? ' active' : '') + '" onclick="carouselGo(' + i + ')"></span>'
    ).join('');
}

function carouselNav(dir) {
  carouselGo((carouselIdx + dir + carouselImgs.length) % carouselImgs.length);
}

function carouselGo(i) {
  carouselIdx = i;
  const img = document.getElementById('car-img');
  if (img) img.src = carouselImgs[i];
  document.querySelectorAll('.car-dot').forEach((d, j) => d.classList.toggle('active', j === i));
}

// ── Modal ─────────────────────────────────────────────────────────────────
function openModal(p) {
  currentModalProduct = p;
  currentModalType    = 'store';
  renderCarousel(getImg(p.code) || [], p.code);
  const mimg = document.getElementById('mimg');
  mimg.style.display = '';

  document.getElementById('mcode').textContent = p.code;
  document.getElementById('mname').textContent = p.name;

  const dets = [];
  if (p.color)    dets.push(['Color', p.color]);
  if (p.category) dets.push(['Category', p.category]);
  if (p.price)    dets.push(['Price', p.price]);
  document.getElementById('mdetails').innerHTML = dets.map(([l,v]) =>
    '<div class="mdet"><label>' + l + '</label><span>' + escHtml(v) + '</span></div>'
  ).join('');

  document.getElementById('msizes').style.display = sizeCols.length ? '' : 'none';
  document.getElementById('os-size-table').style.display = 'none';
  document.getElementById('msizes-grid').innerHTML = sizeCols.map(s => {
    const qty = p.sizes[s];
    if (qty > 0) {
      return '<div class="sc av"><div class="sc-sz">' + s + '</div><div class="sc-qty">' + qty + '</div></div>';
    }
    return '<div class="sc na">' + s + '</div>';
  }).join('');

  document.getElementById('overlay').style.display = 'flex';
}

function closeModal() { document.getElementById('overlay').style.display = 'none'; }

function modalShareProduct() {
  if (!currentModalProduct) return;
  const p = currentModalProduct;
  if (currentModalType === 'store') {
    const availSizes = sizeCols.filter(s => p.sizes[s] > 0);
    shareProduct(p.code, p.name || '', p.price || '', availSizes);
  } else {
    const availSizes = (p.sizes || []).filter(s => s.actual > 0).map(s => s.size);
    shareProduct(p.baseCode, p.category || '', '', availSizes);
  }
}

function modalCopyImage() {
  if (!currentModalProduct) return;
  const code = currentModalType === 'store' ? currentModalProduct.code : currentModalProduct.baseCode;
  copyProductImage(code);
}
function overlayClick(e) { if (e.target === document.getElementById('overlay')) closeModal(); }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'ArrowLeft'  && carouselImgs.length > 1) carouselNav(-1);
  if (e.key === 'ArrowRight' && carouselImgs.length > 1) carouselNav(1);
});
