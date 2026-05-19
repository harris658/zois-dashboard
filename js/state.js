// ── State ────────────────────────────────────────────────────────────────
let products = [];
let allRows  = [];
let imgMap   = {};
let osImgMap = {};
let sizeCols = [];

// ── Online Stock State ────────────────────────────────────────────────────
let activeTab = 'store';
let onlineProducts = [];
let osColMap = {};
let osHeaders = [];
let osRawData = [];

let dailyFeedStats    = null;  // platform listing stats from Daily Feed sheet
let platformStylesMap = {};   // baseCode.toLowerCase() → Set of platforms listed on
let osPlatformFilter  = null; // 'flipkart' | 'ajio' | 'myntra' | 'limeroad' | null
let stockDiff         = null; // stock delta vs previous upload [{code,name,delta}]

const OS_REQUIRED = ['code','size','expected','actual'];
const OS_COL_PATTERNS = {
  code:     [/design.?num/i,/design.?no/i,/\bsku\b/i,/article/i,/(?<!style\s)\bcode\b/i],
  name:     [/product.?name/i,/\bname\b/i,/description/i,/title/i],
  color:    [/colou?r/i],
  size:     [/\bsize\b/i],
  expected: [/expected/i,/exp.?qty/i,/exp.?count/i],
  actual:   [/actual/i],
  diff:     [/diff/i,/difference/i],
};

// ── Modal product reference (used by share) ───────────────────────────────
let currentModalProduct  = null;
let currentModalType     = 'store'; // 'store' | 'online'

// ── Sync timestamp ────────────────────────────────────────────────────────
function saveSyncTime(tab) {
  localStorage.setItem('zois_sync_' + tab, new Date().toISOString());
  updateSyncChip();
}

function getSyncLabel(tab) {
  const iso = localStorage.getItem('zois_sync_' + tab);
  if (!iso) return null;
  const d   = new Date(iso);
  const now = new Date();
  const ms  = now - d;
  if (ms < 86400000) {
    return 'Synced ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  if (ms < 172800000) return 'Synced yesterday';
  return 'Synced ' + d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function updateSyncChip() {
  const chip  = document.getElementById('sync-chip');
  if (!chip) return;
  const label = getSyncLabel(activeTab);
  chip.textContent = label || '';
  chip.style.display = label ? '' : 'none';
}
