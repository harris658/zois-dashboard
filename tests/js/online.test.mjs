import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeContext, loadScripts, run, runJSON } from './_context.mjs';

let ctx;
beforeEach(() => {
  ctx = makeContext();
  loadScripts(ctx, ['state.js', 'online.js']);
});

// ── extractBaseCode ──────────────────────────────────────────────────────────

test('extractBaseCode strips the size suffix matching the size column', () => {
  assert.equal(run(ctx, "extractBaseCode('K5119-XL', 'XL')"), 'K5119');
  assert.equal(run(ctx, "extractBaseCode('EC200-XXL', 'xxl')"), 'EC200');
});

test('extractBaseCode strips a generic size suffix when size text differs', () => {
  assert.equal(run(ctx, "extractBaseCode('K5119-M', 'Medium')"), 'K5119');
  assert.equal(run(ctx, "extractBaseCode('B300-10', '10')"), 'B300');
});

test('extractBaseCode leaves codes without size suffix untouched', () => {
  assert.equal(run(ctx, "extractBaseCode('K5119', '')"), 'K5119');
});

// ── groupOnlineRows ──────────────────────────────────────────────────────────

test('groupOnlineRows groups barcodes into one product per base code', () => {
  ctx.__rows = [
    { Design: 'K5119-M', Size: 'M', Exp: 2, Act: 2, Name: 'Silk Kurta', Color: 'Maroon' },
    { Design: 'K5119-L', Size: 'L', Exp: 1, Act: 0, Name: 'Silk Kurta', Color: 'Maroon' },
    { Design: 'E2001-S', Size: 'S', Exp: 3, Act: 4, Name: 'Ethnic Set', Color: 'Ivory' },
  ];
  ctx.__colMap = { code: 'Design', size: 'Size', expected: 'Exp', actual: 'Act', name: 'Name', color: 'Color' };
  const out = runJSON(ctx, 'groupOnlineRows(__rows, __colMap)');
  assert.equal(out.length, 2);
  const k = out.find(p => p.baseCode === 'K5119');
  assert.equal(k.sizes.length, 2);
  assert.deepEqual(k.sizes[0], { size: 'M', expected: 2, actual: 2, diff: 0 });
  assert.deepEqual(k.sizes[1], { size: 'L', expected: 1, actual: 0, diff: -1 });
});

test('groupOnlineRows computes diff as actual minus expected when no diff column', () => {
  ctx.__rows = [{ Design: 'A1-S', Size: 'S', Exp: 5, Act: 2 }];
  ctx.__colMap = { code: 'Design', size: 'Size', expected: 'Exp', actual: 'Act' };
  const out = runJSON(ctx, 'groupOnlineRows(__rows, __colMap)');
  assert.equal(out[0].sizes[0].diff, -3);
});

test('groupOnlineRows skips rows without a design number', () => {
  ctx.__rows = [
    { Design: '', Size: 'M', Exp: 1, Act: 1 },
    { Design: 'K1-M', Size: 'M', Exp: 1, Act: 1 },
  ];
  ctx.__colMap = { code: 'Design', size: 'Size', expected: 'Exp', actual: 'Act' };
  assert.equal(run(ctx, 'groupOnlineRows(__rows, __colMap)').length, 1);
});
