import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeContext, loadScripts, run } from './_context.mjs';

// Stub environment around checkRemoteFeed: in-memory IDB, recording spies for
// the restore functions, and a fetch that serves a feed manifest + data file.

let ctx, idb, calls;

function setup({ feedJson, feedOk = true, dataOk = true, fetchThrows = false } = {}) {
  idb = new Map();
  calls = { restoreStore: [], restoreOnline: [], profileStatus: [], toasts: [], fetched: [] };
  ctx = makeContext({
    idbGet: async (k) => idb.get(k),
    idbSave: async (k, v) => { idb.set(k, v); },
    parseBufferAsRows: (buf) => [{ Code: 'K1', S: '1' }],
    _restoreStore: async (rows, linked) => { calls.restoreStore.push(rows); },
    _restoreOnline: async (rows) => { calls.restoreOnline.push(rows); },
    renderProfileStatus: (...a) => { calls.profileStatus.push(a); },
    updateSyncChip: () => {},
    fetch: async (url) => {
      if (fetchThrows) throw new TypeError('network down');
      calls.fetched.push(url);
      if (url.endsWith('feed.json')) {
        return { ok: feedOk, json: async () => feedJson };
      }
      return { ok: dataOk, arrayBuffer: async () => new ArrayBuffer(8) };
    },
  });
  ctx.showToast = (msg) => { calls.toasts.push(msg); };
  loadScripts(ctx, ['feed.js']);
}

test('applies a new store version through the restore path', async () => {
  setup({ feedJson: { store: { file: 'store.xlsx', hash: 'abc123', updated: '2026-06-10T09:00:00+05:30' } } });
  await run(ctx, 'checkRemoteFeed()');
  assert.equal(calls.restoreStore.length, 1);
  assert.equal(idb.get('feed-store-hash'), 'abc123');
  assert.equal(idb.get('store').name, 'store.xlsx');
  assert.equal(idb.get('store').source, 'feed');
  assert.equal(ctx.localStorage.getItem('zois_sync_store'), '2026-06-10T09:00:00+05:30');
});

test('skips when the published hash was already applied', async () => {
  setup({ feedJson: { store: { file: 'store.xlsx', hash: 'abc123', updated: 'x' } } });
  idb.set('feed-store-hash', 'abc123');
  await run(ctx, 'checkRemoteFeed()');
  assert.equal(calls.restoreStore.length, 0);
  assert.equal(calls.fetched.length, 1); // only feed.json, not the data file
});

test('never overrides a disk-linked file', async () => {
  setup({ feedJson: { store: { file: 'store.xlsx', hash: 'new999', updated: 'x' } } });
  idb.set('store-handle', { kind: 'file' });
  await run(ctx, 'checkRemoteFeed()');
  assert.equal(calls.restoreStore.length, 0);
});

test('routes online entries to the online restore path', async () => {
  setup({ feedJson: { online: { file: 'online.csv', hash: 'on1', updated: 'x' } } });
  await run(ctx, 'checkRemoteFeed()');
  assert.equal(calls.restoreOnline.length, 1);
  assert.equal(calls.restoreStore.length, 0);
  assert.equal(idb.get('feed-online-hash'), 'on1');
});

test('is silent when offline or feed not published', async () => {
  setup({ fetchThrows: true });
  await run(ctx, 'checkRemoteFeed()');
  assert.equal(calls.restoreStore.length, 0);
  assert.equal(calls.toasts.length, 0);

  setup({ feedJson: null, feedOk: false });
  await run(ctx, 'checkRemoteFeed()');
  assert.equal(calls.restoreStore.length, 0);
});
