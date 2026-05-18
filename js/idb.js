// ── IndexedDB persistence ─────────────────────────────────────────────────
const IDB_DB = 'zois-stock-db', IDB_VER = 1, IDB_STORE = 'files';
function idbOpen() {
  return new Promise((res,rej) => {
    const req = indexedDB.open(IDB_DB, IDB_VER);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = e => res(e.target.result);
    req.onerror = () => rej(req.error);
  });
}
async function idbSave(key, value) {
  const db = await idbOpen();
  return new Promise((res,rej) => {
    const tx = db.transaction(IDB_STORE,'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((res,rej) => {
    const req = db.transaction(IDB_STORE,'readonly').objectStore(IDB_STORE).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function idbDelete(key) {
  const db = await idbOpen();
  return new Promise((res,rej) => {
    const tx = db.transaction(IDB_STORE,'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
