import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeContext, loadScripts, run, runJSON } from './_context.mjs';

let ctx;
beforeEach(() => {
  ctx = makeContext({});
  loadScripts(ctx, ['store-render.js']);
});

test('exact key match still works', () => {
  const r = runJSON(ctx, `_lookupImg({ '1126': ['a.jpg'] }, '1126')`);
  assert.deepEqual(r, ['a.jpg']);
});

test('separator-stripped variants still work', () => {
  const r = runJSON(ctx, `_lookupImg({ 'k5119emb': ['k.jpg'] }, 'K5119 EMB')`);
  assert.deepEqual(r, ['k.jpg']);
});

test('matches filename with descriptor suffix (1126-PPR-XL-RS1995)', () => {
  const map = `{ '1126-ppr-xl-rs1995': ['ppr.jpg'], '1126-ppr-xl': ['ppr.jpg'] }`;
  const r = runJSON(ctx, `_lookupImg(${map}, '1126')`);
  assert.deepEqual(r, ['ppr.jpg']);
});

test('collects all distinct files for a code, deduped', () => {
  const map = `{
    '1126-ppr-xl-rs1995': ['ppr.jpg'], '1126-ppr-xl': ['ppr.jpg'],
    '1126-jq-xl-rs2450':  ['jq.jpg'],  '1126-jq-xl':  ['jq.jpg']
  }`;
  const r = runJSON(ctx, `_lookupImg(${map}, '1126')`);
  assert.deepEqual(r, ['ppr.jpg', 'jq.jpg']);
});

test('matches code inside comma/space list filename', () => {
  const map = `{ '1122ppr to 1125,1126-m-rs1995': ['multi.jpg'] }`;
  assert.deepEqual(runJSON(ctx, `_lookupImg(${map}, '1126')`), ['multi.jpg']);
  assert.deepEqual(runJSON(ctx, `_lookupImg(${map}, '1125')`), ['multi.jpg']);
});

test('no false positive on partial token (112 vs 1126)', () => {
  const r = run(ctx, `_lookupImg({ '1126-ppr-xl': ['ppr.jpg'] }, '112')`);
  assert.equal(r, null);
});

test('returns null when nothing matches', () => {
  const r = run(ctx, `_lookupImg({ '4001': ['x.jpg'] }, '1126')`);
  assert.equal(r, null);
});
