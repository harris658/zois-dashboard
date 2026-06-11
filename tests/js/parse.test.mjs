import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeContext, loadScripts, run, runJSON } from './_context.mjs';

let ctx;
beforeEach(() => {
  ctx = makeContext();
  loadScripts(ctx, ['state.js', 'parse.js']);
});

// ── processRows (wide format: one column per size) ──────────────────────────

test('processRows builds products with parsed size quantities', () => {
  ctx.__rows = [
    { Code: 'K5119', Name: 'Silk Kurta', Color: 'Maroon', Cat: 'Kurtas', Price: '4250', S: '2', M: '0', L: '5' },
    { Code: 'E2001', Name: 'Ethnic Set', Color: 'Ivory', Cat: 'Kurtas', Price: '8350', S: '', M: '1', L: '3' },
  ];
  run(ctx, "sizeCols = ['S','M','L']; processRows(__rows, 'Code','Name','Color','Cat','Price')");
  const products = runJSON(ctx, 'products');
  assert.equal(products.length, 2);
  assert.deepEqual(products[0].sizes, { S: 2, M: 0, L: 5 });
  assert.equal(products[0].code, 'K5119');
  assert.equal(products[0].name, 'Silk Kurta');
  assert.deepEqual(products[1].sizes, { S: 0, M: 1, L: 3 });
});

test('processRows treats no/x/-/na markers as zero and other text as 1', () => {
  ctx.__rows = [
    { Code: 'A100', S: 'no', M: 'x', L: '-', XL: 'NA', XXL: 'yes', XXXL: '✓' },
  ];
  run(ctx, "sizeCols = ['S','M','L','XL','XXL','XXXL']; processRows(__rows, 'Code',null,null,null,null)");
  const sizes = runJSON(ctx, 'products[0].sizes');
  assert.deepEqual(sizes, { S: 0, M: 0, L: 0, XL: 0, XXL: 1, XXXL: 1 });
});

test('processRows drops rows with an empty product code', () => {
  ctx.__rows = [
    { Code: 'K1', S: '1' },
    { Code: '   ', S: '4' },
    { Code: '', S: '2' },
  ];
  run(ctx, "sizeCols = ['S']; processRows(__rows, 'Code',null,null,null,null)");
  assert.equal(run(ctx, 'products.length'), 1);
  assert.equal(run(ctx, 'products[0].code'), 'K1');
});

// ── processRowsLong (long format: one row per code+size) ────────────────────

test('processRowsLong groups rows by code and accumulates size quantities', () => {
  ctx.__rows = [
    { Code: 'K5119', Name: 'Silk Kurta', Size: 'M', Qty: '2' },
    { Code: 'K5119', Name: 'Silk Kurta', Size: 'L', Qty: '1' },
    { Code: 'K5119', Name: 'Silk Kurta', Size: 'M', Qty: '3' },
    { Code: 'E2001', Name: 'Ethnic Set', Size: 'S', Qty: '4' },
  ];
  run(ctx, "processRowsLong(__rows, 'Code','Name',null,null,null,'Size','Qty')");
  const products = runJSON(ctx, 'products');
  assert.equal(products.length, 2);
  assert.deepEqual(products[0].sizes, { M: 5, L: 1 });
  assert.deepEqual(products[1].sizes, { S: 4 });
});

test('processRowsLong derives sizeCols sorted numerically then alphabetically', () => {
  ctx.__rows = [
    { Code: 'A1', Size: '40', Qty: '1' },
    { Code: 'A1', Size: '38', Qty: '1' },
    { Code: 'A2', Size: 'M', Qty: '1' },
    { Code: 'A2', Size: 'L', Qty: '1' },
  ];
  run(ctx, "processRowsLong(__rows, 'Code',null,null,null,null,'Size','Qty')");
  assert.deepEqual(runJSON(ctx, 'sizeCols'), ['38', '40', 'L', 'M']);
});

test('processRowsLong skips rows without code and sizes without value stay zero', () => {
  ctx.__rows = [
    { Code: '', Size: 'M', Qty: '9' },
    { Code: 'K1', Size: 'M', Qty: 'no' },
  ];
  run(ctx, "processRowsLong(__rows, 'Code',null,null,null,null,'Size','Qty')");
  assert.equal(run(ctx, 'products.length'), 1);
  assert.deepEqual(runJSON(ctx, 'products[0].sizes'), { M: 0 });
});

// ── restrictToStandardSizes (sold-out items stay listed) ────────────────────

test('restrictToStandardSizes keeps zero-stock products listed', () => {
  run(ctx, `
    products = [
      { code: '1126', sizes: { S: 0, M: 0, L: 0 } },
      { code: 'K5119', sizes: { S: 2, M: 0, L: 5 } },
    ];
    sizeCols = restrictToStandardSizes(products, ['S','M','L']);
  `);
  assert.equal(run(ctx, 'products.length'), 2);
  assert.equal(run(ctx, "products[0].code"), '1126');
});

test('restrictToStandardSizes filters size columns to standard apparel sizes', () => {
  const cols = runJSON(ctx, `restrictToStandardSizes([], ['S','40','M','Free Size','xl'])`);
  assert.deepEqual(cols, ['S', 'M', 'xl']);
});

test('restrictToStandardSizes strips non-standard size keys from products', () => {
  run(ctx, `
    products = [{ code: 'A1', sizes: { M: 1, '40': 3 } }];
    restrictToStandardSizes(products, ['M','40']);
  `);
  assert.deepEqual(runJSON(ctx, 'products[0].sizes'), { M: 1 });
});
