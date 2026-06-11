import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeContext, loadScripts, run } from './_context.mjs';

let ctx;
beforeEach(() => {
  ctx = makeContext({});
  ctx.document.addEventListener = () => {};
  loadScripts(ctx, ['store-filters.js']);
});

test('matches when a code starts with the query', () => {
  assert.equal(run(ctx, `searchMatches('1126 E0000010 CREAM', '1126')`), true);
});

test('does not match query buried inside another code', () => {
  assert.equal(run(ctx, `searchMatches('K1126KH K0004372 PEACH', '1126')`), false);
});

test('hyphenated codes split into tokens', () => {
  assert.equal(run(ctx, `searchMatches('1126-PPR Silk', '1126')`), true);
  assert.equal(run(ctx, `searchMatches('1126-PPR Silk', 'ppr')`), true);
});

test('name word prefix matches, mid-word does not', () => {
  assert.equal(run(ctx, `searchMatches('K5119 Silk Kurta', 'kur')`), true);
  assert.equal(run(ctx, `searchMatches('K5119 Silk Kurta', 'urta')`), false);
});

test('multi-word query requires every word to prefix-match', () => {
  assert.equal(run(ctx, `searchMatches('K5119 Silk Kurta', 'silk ku')`), true);
  assert.equal(run(ctx, `searchMatches('K5119 Silk Kurta', 'silk cotton')`), false);
});

test('empty query matches everything, case-insensitive', () => {
  assert.equal(run(ctx, `searchMatches('K5119 Silk Kurta', '')`), true);
  assert.equal(run(ctx, `searchMatches('K5119 Silk Kurta', 'SILK')`), true);
});
