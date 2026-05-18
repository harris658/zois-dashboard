// ── Settings & localStorage ───────────────────────────────────────────────
const SETTINGS_KEY = 'zois-col-settings';
function loadSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null'); } catch{return null;} }

function openSettings() {
  const s = loadSettings()||{}, st=s.store||{}, on=s.online||{};
  const v=(id,val)=>{ document.getElementById(id).value=val||''; };
  v('sc-code',st.code); v('sc-name',st.name); v('sc-color',st.color); v('sc-cat',st.cat); v('sc-price',st.price);
  document.getElementById('sc-sizes').value=(st.sizes||[]).join(', ');
  v('oc-code',on.code); v('oc-name',on.name); v('oc-color',on.color);
  v('oc-size',on.size); v('oc-expected',on.expected); v('oc-actual',on.actual); v('oc-diff',on.diff);
  document.getElementById('sdrawer').classList.add('open');
  document.getElementById('sdrawer-overlay').style.display='';
}
function closeSettings() {
  document.getElementById('sdrawer').classList.remove('open');
  document.getElementById('sdrawer-overlay').style.display='none';
}
function saveSettings() {
  const g=id=>document.getElementById(id).value.trim();
  const sizes=g('sc-sizes').split(',').map(s=>s.trim()).filter(Boolean);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    store:  {code:g('sc-code'),name:g('sc-name'),color:g('sc-color'),cat:g('sc-cat'),price:g('sc-price'),sizes},
    online: {code:g('oc-code'),name:g('oc-name'),color:g('oc-color'),size:g('oc-size'),expected:g('oc-expected'),actual:g('oc-actual'),diff:g('oc-diff')}
  }));
  closeSettings();
  showToast('Settings saved ✓');
}
function clearSettings() {
  localStorage.removeItem(SETTINGS_KEY);
  closeSettings();
  showToast('Settings cleared');
}
function showToast(msg) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.style.opacity='1';
  clearTimeout(t._tid); t._tid=setTimeout(()=>{t.style.opacity='0';},2200);
}
