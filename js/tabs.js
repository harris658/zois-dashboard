// ── Tab switching ──────────────────────────────────────────────────────────
const TAB_CONFIG = [
  {
    id:           'store',
    pane:         'tab-store',
    displayValue: 'flex',           // CSS display value when this tab is active
    navItem:      'tab-store-btn',  // pill button — always present in DOM
    onShow:       null,
  },
  {
    id:           'online',
    pane:         'tab-online',
    displayValue: 'flex',
    navItem:      'tab-online-btn',
    onShow:       null,
  },
  {
    id:           'profile',
    pane:         'tab-profile',
    displayValue: '',               // block-level element — uses CSS default
    navItem:      null,
    onShow:       null,
  },
];

function switchTab(name) {
  activeTab = name;
  TAB_CONFIG.forEach(tab => {
    const pane = document.getElementById(tab.pane);
    if (pane) pane.style.display = tab.id === name ? tab.displayValue : 'none';
    const nav = document.getElementById(tab.navItem);
    if (nav) nav.classList.toggle('active', tab.id === name);
  });
  // Profile button highlight
  const profBtn = document.getElementById('profile-btn');
  if (profBtn) profBtn.classList.toggle('active', name === 'profile');
  const active = TAB_CONFIG.find(t => t.id === name);
  if (active && typeof active.onShow === 'function') active.onShow();
  updateSyncChip();
}
