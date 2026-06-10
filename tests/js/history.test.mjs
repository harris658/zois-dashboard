import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeContext, loadScripts, run, runJSON } from './_context.mjs';

let ctx, idb;
beforeEach(() => {
  idb = new Map();
  ctx = makeContext({
    idbGet: async (k) => idb.get(k),
    idbSave: async (k, v) => { idb.set(k, v); },
    idbDelete: async (k) => { idb.delete(k); },
  });
  loadScripts(ctx, ['history.js']);
});

const J = (v) => JSON.parse(JSON.stringify(v));

// ── buildDayEntry ────────────────────────────────────────────────────────────

test('buildDayEntry sums units per code, keeps zero-unit codes, skips blank codes', () => {
  ctx.__p = [
    { code: 'K1', sizes: { S: 2, M: 1 } },
    { code: 'K2', sizes: {} },
    { code: 'K1', sizes: { L: 1 } },
    { code: '', sizes: { S: 9 } },
  ];
  assert.deepEqual(runJSON(ctx, 'buildDayEntry(__p)'), { K1: 4, K2: 0 });
});

// ── recordHistory ────────────────────────────────────────────────────────────

test('recordHistory creates history with start, day entry, and firstSeen', async () => {
  ctx.__p = [{ code: 'K1', sizes: { S: 2 } }];
  await run(ctx, "recordHistory(__p, new Date('2026-06-10T12:00:00'))");
  const h = J(idb.get('store-history'));
  assert.equal(h.start, '2026-06-10');
  assert.deepEqual(h.days['2026-06-10'], { K1: 2 });
  assert.equal(h.firstSeen.K1, '2026-06-10');
});

test('recordHistory overwrites the same day and prunes entries older than 35 days', async () => {
  idb.set('store-history', {
    start: '2026-04-01',
    days: { '2026-04-01': { K9: 5 }, '2026-06-09': { K1: 3 } },
    firstSeen: { K9: '2026-04-01', K1: '2026-06-09' },
  });
  ctx.__p = [{ code: 'K1', sizes: { S: 2 } }];
  await run(ctx, "recordHistory(__p, new Date('2026-06-10T12:00:00'))");
  const h = J(idb.get('store-history'));
  assert.equal(h.days['2026-04-01'], undefined); // pruned (> 35 days old)
  assert.deepEqual(h.days['2026-06-10'], { K1: 2 });
  assert.deepEqual(h.days['2026-06-09'], { K1: 3 });
});

test('recordHistory migrates old store-snapshots on first run and deletes them', async () => {
  idb.set('store-snapshots', [
    { date: '2026-06-08T10:00:00', products: [{ code: 'K1', sizes: { S: 5 } }] },
    { date: '2026-06-09T10:00:00', products: [{ code: 'K1', sizes: { S: 3 } }] },
  ]);
  ctx.__p = [{ code: 'K1', sizes: { S: 2 } }];
  await run(ctx, "recordHistory(__p, new Date('2026-06-10T12:00:00'))");
  const h = J(idb.get('store-history'));
  assert.equal(h.start, '2026-06-08');
  assert.deepEqual(h.days['2026-06-08'], { K1: 5 });
  assert.deepEqual(h.days['2026-06-09'], { K1: 3 });
  assert.deepEqual(h.days['2026-06-10'], { K1: 2 });
  assert.equal(h.firstSeen.K1, '2026-06-08');
  assert.equal(idb.get('store-snapshots'), undefined);
});

// ── computeMonthlyMovement ──────────────────────────────────────────────────

test('returns trackedDays<2 shape when history has under two days', () => {
  ctx.__hist = { start: '2026-06-10', days: { '2026-06-10': { K1: 2 } }, firstSeen: { K1: '2026-06-10' } };
  const mv = runJSON(ctx, "computeMonthlyMovement(__hist, new Date('2026-06-10T12:00:00'))");
  assert.equal(mv.trackedDays, 1);
  assert.equal(mv.since, '2026-06-10');
  assert.deepEqual(mv.movers, []);
});

test('counts drops as units out, vanished codes as fully sold, ignores restocks', () => {
  ctx.__hist = {
    start: '2026-06-01',
    days: {
      '2026-06-01': { K1: 5, K2: 3 },
      '2026-06-05': { K1: 3, K2: 4 },
      '2026-06-08': { K2: 4 },
    },
    firstSeen: { K1: '2026-06-01', K2: '2026-06-01' },
  };
  const mv = runJSON(ctx, "computeMonthlyMovement(__hist, new Date('2026-06-10T12:00:00'))");
  assert.equal(mv.unitsOut, 5);       // K1: 5→3 (2) then 3→gone (3)
  assert.equal(mv.stylesMoved, 1);    // K2 only restocked, never dropped
  assert.deepEqual(mv.movers, [{ code: 'K1', units: 5 }]);
});

test('newArrivals counts firstSeen inside the window but excludes the initial import', () => {
  ctx.__hist = {
    start: '2026-06-01',
    days: { '2026-06-01': { K1: 5 }, '2026-06-05': { K1: 5, K3: 2 } },
    firstSeen: { K1: '2026-06-01', K3: '2026-06-05' },
  };
  const mv = runJSON(ctx, "computeMonthlyMovement(__hist, new Date('2026-06-10T12:00:00'))");
  assert.equal(mv.newArrivals, 1); // K3 only — K1 was the initial import (firstSeen == start)
});

test('prune boundary: an entry exactly 35 days old is kept', async () => {
  idb.set('store-history', {
    start: '2026-05-06',
    days: { '2026-05-06': { K9: 5 } }, // exactly 35 days before 2026-06-10
    firstSeen: { K9: '2026-05-06' },
  });
  ctx.__p = [{ code: 'K1', sizes: { S: 2 } }];
  await run(ctx, "recordHistory(__p, new Date('2026-06-10T12:00:00'))");
  const h = JSON.parse(JSON.stringify(idb.get('store-history')));
  assert.deepEqual(h.days['2026-05-06'], { K9: 5 });
});

test('migration skips snapshots with missing or invalid dates', async () => {
  idb.set('store-snapshots', [
    { products: [{ code: 'BAD', sizes: { S: 1 } }] },                      // no date
    { date: 'not-a-date', products: [{ code: 'BAD2', sizes: { S: 1 } }] }, // unparseable
    { date: '2026-06-09T10:00:00', products: [{ code: 'K1', sizes: { S: 3 } }] },
  ]);
  ctx.__p = [{ code: 'K1', sizes: { S: 2 } }];
  await run(ctx, "recordHistory(__p, new Date('2026-06-10T12:00:00'))");
  const h = JSON.parse(JSON.stringify(idb.get('store-history')));
  assert.equal(h.start, '2026-06-09');
  assert.equal(Object.keys(h.days).some(k => k.includes('NaN')), false);
  assert.equal(h.firstSeen.BAD, undefined);
});

test('movers are top 5 sorted by units out', () => {
  const days = { '2026-06-01': {}, '2026-06-02': {} };
  const firstSeen = {};
  for (let i = 1; i <= 7; i++) {
    days['2026-06-01']['C' + i] = 10;
    days['2026-06-02']['C' + i] = 10 - i; // C7 drops most
    firstSeen['C' + i] = '2026-06-01';
  }
  ctx.__hist = { start: '2026-06-01', days, firstSeen };
  const mv = runJSON(ctx, "computeMonthlyMovement(__hist, new Date('2026-06-10T12:00:00'))");
  assert.equal(mv.movers.length, 5);
  assert.equal(mv.movers[0].code, 'C7');
  assert.equal(mv.movers[0].units, 7);
  assert.equal(mv.movers[4].code, 'C3');
});
