// Loads the real js/ source files unmodified into a node:vm context with a
// stub DOM, so the parsing/grouping logic can be unit-tested without a browser.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function makeEl() {
  return {
    addEventListener() {},
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    dataset: {},
    options: [],
    files: [],
    value: '',
    innerHTML: '',
    textContent: '',
    className: '',
    disabled: false,
    checked: false,
    click() {},
    after() {},
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

export function makeContext(extras = {}) {
  const sandbox = {
    document: {
      getElementById: () => makeEl(),
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => makeEl(),
    },
    window: {},
    navigator: {},
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] ?? null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; },
    },
    URL: { createObjectURL: () => 'blob:stub' },
    console,
    escHtml: (s) => String(s),
    showToast: () => {},
    loadSettings: () => null,
    ...extras,
  };
  return vm.createContext(sandbox);
}

export function loadScripts(context, files) {
  for (const f of files) {
    const src = readFileSync(path.join(ROOT, 'js', f), 'utf-8');
    vm.runInContext(src, context, { filename: f });
  }
}

export function run(context, code) {
  return vm.runInContext(code, context);
}

// vm objects live in another realm (different Object prototype), which breaks
// deepStrictEqual — roundtrip through JSON for structural comparisons.
export function runJSON(context, code) {
  return JSON.parse(JSON.stringify(vm.runInContext(code, context)));
}
