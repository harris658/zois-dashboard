import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeContext, loadScripts, run } from './_context.mjs';

let ctx;
beforeEach(() => {
  ctx = makeContext({});
  loadScripts(ctx, ['store-render.js']);
});

test('szChipState: 0 is oos, 1-2 is low, 3+ is ok', () => {
  assert.equal(run(ctx, 'szChipState(0)'), 'oos');
  assert.equal(run(ctx, 'szChipState(1)'), 'low');
  assert.equal(run(ctx, 'szChipState(2)'), 'low');
  assert.equal(run(ctx, 'szChipState(3)'), 'ok');
  assert.equal(run(ctx, 'szChipState(16)'), 'ok');
});

test('szChipHTML renders size and qty with state class', () => {
  const html = run(ctx, 'szChipHTML("L", 3)');
  assert.match(html, /class="sz-chip ok"/);
  assert.match(html, />L</);
  assert.match(html, /· 3/);
});

test('szChipHTML with qty 1 shows size letter only', () => {
  const html = run(ctx, 'szChipHTML("M", 1)');
  assert.match(html, /class="sz-chip low"/);
  assert.doesNotMatch(html, /sz-qty/);
});

test('szChipHTML with qty 0 shows muted oos chip with · 0', () => {
  const html = run(ctx, 'szChipHTML("XL", 0)');
  assert.match(html, /class="sz-chip oos"/);
  assert.match(html, /· 0/);
});

test('szChipHTML appends extra class and escapes size', () => {
  assert.match(run(ctx, 'szChipHTML("L", 5, "hi")'), /class="sz-chip ok hi"/);
  assert.match(run(ctx, 'szChipHTML("<b>", 5)'), /&lt;b&gt;/);
});
