// ── Profile tab helpers ────────────────────────────────────────────────────
const HAS_FS_ACCESS = typeof window.showOpenFilePicker === 'function';

function renderProfileStatus(which, name, date, linked) {
  const el = document.getElementById('pf-' + which + '-status');
  if (!el) return;
  const d = date ? new Date(date).toLocaleString('en-IN', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
  const badge = linked ? '<div class="pf-linked-badge">🔗 Linked to disk — auto-reloads</div>' : '';
  const sub = linked ? 'Last read ' + d : 'Saved ' + d;
  el.innerHTML = '<div class="pf-file-info"><span class="pf-file-icon">📄</span><div>' + badge + '<div class="pf-file-name">' + escHtml(name) + '</div><div class="pf-file-date">' + sub + '</div></div></div>';
  // Show re-link button if linked, otherwise show link button
  const btn = document.getElementById('pf-' + which + '-link-btn');
  if (btn && HAS_FS_ACCESS) {
    btn.style.display = '';
    btn.textContent = linked ? '🔗 Re-link location' : '🔗 Link file on disk';
  }
}

function showReloadNotice(which, handle) {
  const el = document.getElementById('pf-' + which + '-status');
  if (!el) return;
  const notice = document.createElement('div');
  notice.className = 'pf-reload-notice';
  notice.id = 'pf-' + which + '-reload';
  notice.innerHTML = '<span>File linked but needs permission to read. Click to load latest version from disk.</span>' +
    '<button class="pf-btn-reload" onclick="reloadFromHandle(\'' + which + '\')">Reload from disk</button>';
  el.after(notice);
}

async function reloadFromHandle(which) {
  try {
    const handle = await idbGet(which + '-handle');
    if (!handle) return;
    const perm = await handle.requestPermission({ mode: 'read' });
    if (perm !== 'granted') { showToast('Permission denied'); return; }
    const file = await handle.getFile();
    const notice = document.getElementById('pf-' + which + '-reload');
    if (notice) notice.remove();
    if (which === 'store') {
      await parseFile(file);
      if (btnLaunch) btnLaunch.disabled = false;
      document.getElementById('zone-data').classList.add('done');
      setStatus('st-data','ok','✓ loaded from linked file');
      document.getElementById('btn-launch').click();
      showToast('Reloaded from disk ✓');
    } else {
      await _loadOnlineFile(file);
      showToast('Online stock reloaded from disk ✓');
    }
    renderProfileStatus(which, file.name, new Date().toISOString(), true);
  } catch(e) { showToast('Error: ' + e.message); }
}

async function linkFileLocation(which) {
  if (!HAS_FS_ACCESS) { showToast('Not supported in this browser — use Chrome or Edge'); return; }
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Spreadsheet', accept: {
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
        'application/vnd.ms-excel': ['.xls'],
        'text/csv': ['.csv']
      }}],
      multiple: false
    });
    await idbSave(which + '-handle', handle);
    const file = await handle.getFile();
    if (which === 'store') {
      await parseFile(file);
      if (btnLaunch) btnLaunch.disabled = false;
      document.getElementById('zone-data').classList.add('done');
      setStatus('st-data','ok','✓ loaded from linked file');
      document.getElementById('btn-launch').click();
    } else {
      await _loadOnlineFile(file);
    }
    renderProfileStatus(which, file.name, new Date().toISOString(), true);
    showToast('File linked ✓ — auto-reloads every time you open this dashboard');
  } catch(e) {
    if (e.name !== 'AbortError') showToast('Error: ' + e.message);
  }
}

async function _loadOnlineFile(file) {
  const buf = await file.arrayBuffer();
  const data = parseBufferAsRows(buf, file.name);
  osHeaders = Object.keys(data[0]).filter(k => !k.startsWith('_'));
  osRawData = data;
  const _d = new Date().toISOString();
  await idbSave('online', { name: file.name, date: _d, buffer: buf });
  const detected = detectOsCols(osHeaders);
  const _sv = loadSettings(); const _ov = (_sv&&_sv.online)||{};
  Object.entries(_ov).forEach(([fld,sv]) => { if(sv&&detected[fld]===undefined){const m=osHeaders.find(h=>h.toLowerCase()===sv.toLowerCase());if(m)detected[fld]=m;} });
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
}

async function clearCachedFile(which) {
  await idbDelete(which);
  await idbDelete(which + '-handle');
  const el = document.getElementById('pf-' + which + '-status');
  if (el) el.innerHTML = '<div class="pf-empty">No file saved</div>';
  const notice = document.getElementById('pf-' + which + '-reload');
  if (notice) notice.remove();
  const btn = document.getElementById('pf-' + which + '-link-btn');
  if (btn && HAS_FS_ACCESS) { btn.style.display = ''; btn.textContent = '🔗 Link file on disk'; }
  showToast((which === 'store' ? 'Store' : 'Online') + ' file cleared');
  if (which === 'store') {
    products = []; allRows = [];
    document.getElementById('store-setup').style.display = '';
    document.getElementById('store-grid').style.display = 'none';
  } else {
    onlineProducts = []; osRawData = [];
    document.getElementById('os-setup').style.display = '';
    document.getElementById('os-grid-wrap').style.display = 'none';
  }
}

function parseBufferAsRows(buffer, filename) {
  let wb;
  if ((filename||'').toLowerCase().endsWith('.csv')) {
    wb = XLSX.read(new TextDecoder().decode(buffer), { type: 'string' });
  } else {
    wb = XLSX.read(buffer, { type: 'array' });
  }
  const rows = parseWorkbook(wb);
  if (!rows.length) throw new Error('No rows found');
  return rows;
}

// Profile tab — file upload handlers
document.getElementById('pf-store-inp').addEventListener('change', async () => {
  const f = document.getElementById('pf-store-inp').files[0];
  if (!f) return;
  try {
    await parseFile(f);
    renderProfileStatus('store', f.name, new Date().toISOString(), false);
    showToast('Store file updated ✓');
    switchTab('store');
  } catch(e) { showToast('Error: ' + e.message); }
});

document.getElementById('pf-online-inp').addEventListener('change', async () => {
  const f = document.getElementById('pf-online-inp').files[0];
  if (!f) return;
  try {
    await _loadOnlineFile(f);
    renderProfileStatus('online', f.name, new Date().toISOString(), false);
    showToast('Online file updated ✓');
    switchTab('online');
  } catch(e) { showToast('Error: ' + e.message); }
});

// ── Auto-restore from IndexedDB on load ───────────────────────────────────
async function _restoreStore(rows, linked) {
  allRows = rows;
  showMapper(rows);
  // showMapper already applies saved column settings; map-code always has a value after that
  const codeEl = document.getElementById('map-code');
  if (codeEl && codeEl.value) {
    if (btnLaunch) btnLaunch.disabled = false;
    document.getElementById('zone-data').classList.add('done');
    setStatus('st-data', 'ok', '✓ ' + rows.length + ' rows loaded');
    document.getElementById('btn-launch').click();
    if (linked) showToast('Store stock loaded from linked file ✓');
    else showToast('Store stock restored ✓');
  }
}

async function _restoreOnline(data) {
  osHeaders = Object.keys(data[0]).filter(k => !k.startsWith('_'));
  osRawData = data;
  const detected = detectOsCols(osHeaders);
  const _sv = loadSettings(); const _ov = (_sv&&_sv.online)||{};
  Object.entries(_ov).forEach(([fld,sv]) => { if(sv&&detected[fld]===undefined){const m=osHeaders.find(h=>h.toLowerCase()===sv.toLowerCase());if(m)detected[fld]=m;} });
  const missing = OS_REQUIRED.filter(k => detected[k] === undefined);
  if (!missing.length) {
    osColMap = detected;
    launchOnline();
  } else {
    osColMap = detected;
    buildOsMapper(osHeaders, detected);
    document.getElementById('os-col-mapper').style.display = 'block';
    document.getElementById('os-st').textContent = '✓ ' + data.length + ' rows loaded — match columns below';
    document.getElementById('os-st').className = 'uz-status ok';
    document.getElementById('os-zone').classList.add('done');
    document.getElementById('os-launch').disabled = false;
  }
}

async function initFromCache() {
  // Show "Link file on disk" buttons if API is available
  if (HAS_FS_ACCESS) {
    document.getElementById('pf-store-link-btn').style.display = '';
    document.getElementById('pf-online-link-btn').style.display = '';
  }

  // ── Store tab ──────────────────────────────────────────────────────────
  try {
    const handle = await idbGet('store-handle');
    if (handle) {
      const perm = await handle.queryPermission({ mode: 'read' });
      if (perm === 'granted') {
        // Same session — read latest file directly from disk
        const file = await handle.getFile();
        const rows = parseBufferAsRows(await file.arrayBuffer(), file.name);
        renderProfileStatus('store', file.name, new Date().toISOString(), true);
        if (rows.length) await _restoreStore(rows, true);
      } else {
        // New session — need user gesture; show reload button, fall back to buffer
        const saved = await idbGet('store');
        if (saved && saved.buffer) {
          renderProfileStatus('store', saved.name, saved.date, true);
          showReloadNotice('store', handle);
          const rows = parseBufferAsRows(saved.buffer, saved.name);
          if (rows.length) await _restoreStore(rows, false);
        }
      }
    } else {
      // No handle — use uploaded buffer
      const saved = await idbGet('store');
      if (saved && saved.buffer) {
        renderProfileStatus('store', saved.name, saved.date, false);
        const rows = parseBufferAsRows(saved.buffer, saved.name);
        if (rows.length) await _restoreStore(rows, false);
      }
    }
  } catch(e) { console.log('initFromCache store error:', e); showToast('Restore failed — please upload your file again'); }

  // ── Online tab ─────────────────────────────────────────────────────────
  try {
    const handle = await idbGet('online-handle');
    if (handle) {
      const perm = await handle.queryPermission({ mode: 'read' });
      if (perm === 'granted') {
        const file = await handle.getFile();
        const data = parseBufferAsRows(await file.arrayBuffer(), file.name);
        renderProfileStatus('online', file.name, new Date().toISOString(), true);
        if (data.length) { await _restoreOnline(data); showToast('Online stock loaded from linked file ✓'); }
      } else {
        const saved = await idbGet('online');
        if (saved && saved.buffer) {
          renderProfileStatus('online', saved.name, saved.date, true);
          showReloadNotice('online', handle);
          const data = parseBufferAsRows(saved.buffer, saved.name);
          if (data.length) await _restoreOnline(data);
        }
      }
    } else {
      const saved = await idbGet('online');
      if (saved && saved.buffer) {
        renderProfileStatus('online', saved.name, saved.date, false);
        const data = parseBufferAsRows(saved.buffer, saved.name);
        if (data.length) { await _restoreOnline(data); showToast('Online stock restored ✓'); }
      }
    }
  } catch(e) { console.log('initFromCache online error:', e); showToast('Restore failed — please upload your file again'); }

  // ── Images ─────────────────────────────────────────────────────────────
  try {
    const handle = await idbGet('imgs-handle');
    if (handle) {
      const perm = await handle.queryPermission({ mode: 'read' });
      if (perm === 'granted') {
        await loadImagesFromHandle(handle);
      } else {
        const statusEl = document.getElementById('st-imgs');
        if (statusEl) {
          const notice = document.createElement('div');
          notice.className = 'pf-reload-notice';
          notice.id = 'pf-imgs-reload';
          notice.innerHTML = '<span>Image folder linked but needs permission to read.</span>' +
            '<button class="pf-btn-reload" onclick="reloadImgsFromHandle()">Reload images</button>';
          statusEl.after(notice);
          statusEl.textContent = 'Image folder saved — click to reload';
        }
      }
    }
  } catch(e) { /* images are optional */ }
}

async function reloadImgsFromHandle() {
  try {
    const handle = await idbGet('imgs-handle');
    if (!handle) return;
    const perm = await handle.requestPermission({ mode: 'read' });
    if (perm !== 'granted') { showToast('Permission denied'); return; }
    const notice = document.getElementById('pf-imgs-reload');
    if (notice) notice.remove();
    await loadImagesFromHandle(handle);
    showToast('Images reloaded ✓');
  } catch(e) { showToast('Error: ' + e.message); }
}

async function syncFromDisk() {
  const storeH  = await idbGet('store-handle').catch(() => null);
  const onlineH = await idbGet('online-handle').catch(() => null);
  if (!storeH && !onlineH) {
    showToast('No linked files — link files in Profile tab first');
    return;
  }
  if (storeH)  await reloadFromHandle('store');
  if (onlineH) await reloadFromHandle('online');
}

initFromCache();
