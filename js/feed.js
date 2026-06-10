// ── Central data feed ──────────────────────────────────────────────────────
// The build publishes data/feed.json + the data files when a data/ folder
// exists in the repo. On open, each tab without a disk-linked file checks the
// feed and loads any new version through the same path as a manual upload.
// Offline or no feed published → silent no-op (IDB restore already happened).

async function checkRemoteFeed() {
  let feed;
  try {
    const res = await fetch('./data/feed.json', { cache: 'no-store' });
    if (!res.ok) return;
    feed = await res.json();
  } catch (e) { return; }

  for (const which of ['store', 'online']) {
    const entry = feed[which];
    if (!entry || !entry.file || !entry.hash) continue;
    try {
      // Disk-linked file wins — the feed never overrides an explicit link
      const handle = await idbGet(which + '-handle');
      if (handle) continue;
      const applied = await idbGet('feed-' + which + '-hash');
      if (applied === entry.hash) continue;

      const res = await fetch('./data/' + encodeURIComponent(entry.file), { cache: 'no-store' });
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      const rows = parseBufferAsRows(buf, entry.file);
      if (!rows.length) continue;

      await idbSave(which, { name: entry.file, date: entry.updated, buffer: buf, source: 'feed' });
      await idbSave('feed-' + which + '-hash', entry.hash);

      if (which === 'store') await _restoreStore(rows, false);
      else await _restoreOnline(rows);
      renderProfileStatus(which, entry.file, entry.updated, false);

      // Sync chip shows when the data was published, not when this device loaded it
      if (entry.updated) {
        localStorage.setItem('zois_sync_' + which, entry.updated);
        updateSyncChip();
      }
      showToast('Latest ' + (which === 'store' ? 'store' : 'online') + ' stock loaded ✓');
    } catch (e) {
      console.log('feed ' + which + ' load failed:', e);
    }
  }
}
