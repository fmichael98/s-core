/* s-core — guscio comune delle app S* (SMoney, SHealth, SCalendar, SMonitor…)
 *
 * Mette a disposizione, come globali, tutto quello che prima era copiato in ogni app:
 *   $, esc, css, app              piccoli aiuti
 *   api, get, setLive             chiamate al server (con intestazione anti-CSRF dell'app)
 *   toast, openModal, closeModal, choose, confirmDel, formModal, COLORS
 *   tapAndHold, tapFast           tocchi: breve/lungo, pulsante pronto al sollevamento del dito
 *   S, views, viewCache, navigate, render
 *   Shell.start(cfg)              avvio: carica i dati, mostra la sezione, attiva menu utente, gesti, aggiornamento dal vivo
 *
 * L'app, prima di caricare questo file, imposta window.SHELL = { name, csrf, ua } e poi chiama Shell.start({...}).
 */
(function () {
'use strict';

const CFG = Object.assign({ name: 'App', csrf: 'X-App', ua: null, home: 'home', fab: null, noFab: [], aliases: {} }, window.SHELL || {});
const H = {};   // ganci dell'app (da Shell.start)

// nessun campo propone testi già scritti (il riquadro dei suggerimenti chiude la tastiera nell'app)
(function () {
  const off = el => { if (el.matches && el.matches('input:not([type=hidden]),textarea,form') && el.getAttribute('autocomplete') !== 'off') { el.setAttribute('autocomplete', 'off'); if (el.tagName !== 'FORM') { el.setAttribute('autocorrect', 'off'); if (el.type !== 'number' && el.type !== 'date') el.setAttribute('spellcheck', 'false'); } } };
  const scan = root => { off(root); root.querySelectorAll && root.querySelectorAll('input,textarea,form').forEach(off); };
  scan(document.body);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && scan(n)))).observe(document.body, { childList: true, subtree: true });
})();

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const app = window.AndroidApp;

// ---------------------------------------------------------------- stato condiviso
const S = { settings: null, view: CFG.home };

// ---------------------------------------------------------------- api
let apiFails = 0;
async function api(method, path, body, raw) {
  let res;
  try {
    res = await fetch(path, {
      method, headers: Object.assign({ [CFG.csrf]: '1' }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin',
    });
  } catch (e) {
    setLive(false);
    // un solo errore (rete che cambia, app appena tornata in primo piano) non basta: schermata "server non raggiungibile" solo al secondo di fila
    if (++apiFails >= 2 && app && app.connectionLost) try { app.connectionLost(); } catch (_) {}
    throw new Error('Server non raggiungibile');
  }
  apiFails = 0;
  if (res.status === 401) { location.href = '/login'; throw new Error('sessione scaduta'); }
  if (res.status >= 500 && app && app.connectionLost) try { app.connectionLost(); } catch (_) {}
  setLive(true);
  if (raw) return res;
  let j = null;
  try { j = await res.json(); } catch (e) {}
  if (!res.ok || (j && j.ok === false)) throw new Error((j && j.error) || ('errore ' + res.status));
  return j;
}
const get = p => api('GET', p);
function setLive(ok) {
  const l = $('live'); if (!l) return;
  l.classList.toggle('stale', !ok);
  const t = $('liveTxt'); if (t) t.textContent = ok ? ('v' + ((S.settings && S.settings.version) || '')) : 'disconnesso';
}

// ---------------------------------------------------------------- toast / modali
let toastT;
function toast(msg, bad) {
  const t = $('toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), bad ? 4000 : 2200);
}
let modalGen = 0;
/** Apre la finestra solo quando il contenuto è pronto (immagini caricate, al massimo 600 ms): niente finestra che si ridimensiona mentre si apre. */
function openModal(html, cls) {
  const box = $('modalBox'); box.innerHTML = html; box.className = 'box' + (cls ? ' ' + cls : ''); const g = ++modalGen;
  const imgs = [...box.querySelectorAll('img')].filter(i => !i.complete);
  const show = () => { if (g !== modalGen || !box.innerHTML) return; $('modal').classList.add('open'); };
  if (!imgs.length) { show(); return; }
  Promise.race([Promise.all(imgs.map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))), new Promise(r => setTimeout(r, 600))]).then(show);
}
function closeModal() { ++modalGen; $('modal').classList.remove('open'); $('modalBox').innerHTML = ''; }
$('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('modal').classList.contains('open')) { e.preventDefault(); closeModal(); } });
window.appBack = function () { const m2 = $('modal2'); if (m2 && m2.classList.contains('open')) { m2.classList.remove('open'); return true; } if ($('modal').classList.contains('open')) { closeModal(); return true; } return false; };

/** Scelta tra più opzioni: ritorna la chiave scelta o null. */
function choose(title, sub, options) {
  return new Promise(resolve => {
    openModal(`<h3>${esc(title)}</h3><div class="sub">${esc(sub || '')}</div>
      <div class="choice">${options.map(o => `<button type="button" data-k="${esc(o.k)}">${esc(o.t)}${o.s ? `<small>${esc(o.s)}</small>` : ''}</button>`).join('')}</div>
      <div class="btns"><button class="btn" type="button" data-k="">Annulla</button></div>`);
    $('modalBox').querySelectorAll('button[data-k]').forEach(b => b.onclick = () => { closeModal(); resolve(b.dataset.k || null); });
  });
}
function confirmDel(what) { return choose('Eliminare?', what, [{ k: 'y', t: 'Sì, elimina' }]).then(k => k === 'y'); }

const COLORS = ['#f5c451','#3ddc97','#4fb3ff','#c792ea','#ffb547','#ff6b6b','#7ed957','#ff8fab','#8be9fd','#bd93f9','#ffa07a','#e9a5ff','#7d8894'];

/** Modale con form. fields: [{k,l,type,v,opts,full,hint,step,req,ph,min,max,rows,accept,unit,ro,onChange}].
 *  type: text (default), number, date, select, textarea, check, seg, hidden, color, file, datalist,
 *        amount (valuta dell'app), unit (f.unit es. "kg", f.step). onSave(values, form) può lanciare un errore (mostrato). */
function formModal(title, fields, onSave, extra) {
  const html = fields.map(f => {
    if (f.type === 'hidden') return '';
    if (f.type === 'seg') return `<div class="full"><label>${esc(f.l)}</label><div class="seg" data-k="${f.k}" style="margin-top:6px;flex-wrap:wrap">${f.opts.map(o => `<button type="button" data-v="${esc(o.v)}" class="${o.v === f.v ? 'on ' + (o.c || '') : ''}">${esc(o.t)}</button>`).join('')}</div></div>`;
    if (f.type === 'check') return `<div class="${f.full ? 'full' : ''}"><label class="chk"><input type="checkbox" name="${f.k}" ${f.v ? 'checked' : ''}> ${esc(f.l)}</label></div>`;
    let inp;
    if (f.type === 'select') inp = `<select name="${f.k}">${f.opts.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(f.v ?? '') ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select>`;
    else if (f.type === 'textarea') inp = `<textarea name="${f.k}" rows="${f.rows || 2}" ${f.ph ? `placeholder="${esc(f.ph)}"` : ''}>${esc(f.v ?? '')}</textarea>`;
    else if (f.type === 'amount' || f.type === 'unit' || f.type === 'kg' || f.type === 'eur') {
      const unit = f.type === 'amount' ? ((H.currency && H.currency()) || '€') : f.type === 'kg' ? 'kg' : f.type === 'eur' ? '€' : (f.unit || '');
      const step = f.step || (f.type === 'kg' ? '0.1' : '0.01');
      inp = `<div class="amtbox"><span>${esc(unit)}</span><input name="${f.k}" type="number" inputmode="decimal" step="${step}" min="0" value="${f.v ?? ''}" ${f.req ? 'required' : ''} placeholder="${step === '0.1' ? '0,0' : '0,00'}"></div>`;
    }
    else if (f.type === 'color') inp = `<input name="${f.k}" type="hidden" value="${esc(f.v ?? '')}"><div class="swatches" data-k="${f.k}">${COLORS.map(c => `<i style="background:${c}" data-c="${c}" class="${c === f.v ? 'on' : ''}"></i>`).join('')}</div>`;
    else if (f.type === 'file') inp = `<input name="${f.k}" type="file" ${f.accept ? `accept="${esc(f.accept)}"` : ''} class="fileinp">`;
    else if (f.type === 'datalist') inp = `<input name="${f.k}" type="text" value="${esc(f.v ?? '')}" list="dl_${f.k}" ${f.req ? 'required' : ''} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''}><datalist id="dl_${f.k}">${f.opts.map(o => `<option value="${esc(o)}">`).join('')}</datalist>`;
    else if (f.ro) inp = `<input name="${f.k}" type="text" value="${esc(f.v ?? '')}" readonly style="opacity:.7">`;
    else inp = `<input name="${f.k}" type="${f.type || 'text'}" value="${esc(f.v ?? '')}" ${f.req ? 'required' : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : ''} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''} ${f.type === 'number' ? 'inputmode="decimal"' : ''}>`;
    return `<div class="${f.full ? 'full' : ''}"><label>${esc(f.l)}</label>${inp}${f.hint ? `<div class="hint">${f.hint}</div>` : ''}</div>`;
  }).join('');
  openModal(`<h3>${esc(title)}</h3><form id="mf"><div class="fg">${html}</div><div class="msg bad" id="mmsg"></div>
    <div class="btns">${extra || ''}<button class="btn" type="button" id="mcancel">Annulla</button><button class="btn pri" type="submit">Salva</button></div></form>`);
  const form = $('mf');
  const vals = {};
  fields.forEach(f => { if (f.type === 'seg' || f.type === 'hidden') vals[f.k] = f.v; });
  form.querySelectorAll('.seg').forEach(seg => seg.querySelectorAll('button').forEach(b => b.onclick = () => {
    seg.querySelectorAll('button').forEach(x => x.className = '');
    const f = fields.find(x => x.k === seg.dataset.k); const o = (f.opts || []).find(o => o.v === b.dataset.v) || {};
    b.className = 'on ' + (o.c || ''); vals[seg.dataset.k] = b.dataset.v;
    if (f.onChange) f.onChange(b.dataset.v, form);
  }));
  form.querySelectorAll('.swatches').forEach(sw => sw.querySelectorAll('i').forEach(i => i.onclick = () => {
    sw.querySelectorAll('i').forEach(x => x.classList.remove('on')); i.classList.add('on');
    form.querySelector(`input[name=${sw.dataset.k}]`).value = i.dataset.c;
  }));
  $('mcancel').onclick = closeModal;
  const first = form.querySelector('input:not([type=hidden]),select,textarea'); if (first && !('ontouchstart' in window)) first.focus();
  if (H.onForm) try { H.onForm(form, fields, vals); } catch (e) { console.error(e); }
  form.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(form); const v = Object.assign({}, vals);
    fields.forEach(f => { if (f.type === 'check') v[f.k] = form.querySelector(`[name=${f.k}]`).checked; else if (f.type !== 'seg' && f.type !== 'hidden') v[f.k] = fd.get(f.k); if (f.type === 'select' && v[f.k] === 'new') v[f.k] = ''; });
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    try { await onSave(v, form); if ($('modalBox').contains(form)) closeModal(); }   // se il salvataggio ha aperto un'altra finestra, quella resta
    catch (err) { if ($('mmsg')) $('mmsg').textContent = err.message; btn.disabled = false; }
  };
  return form;
}

// ---------------------------------------------------------------- tocchi
/** Tocco breve e tocco lungo (≈0,5 s) su un elemento: funziona con dito e mouse. onTap riceve l'evento (pointerType, target). */
function tapAndHold(el, onTap, onHold) {
  let timer = null, held = false, moved = false, x0 = 0, y0 = 0;
  const start = e => {
    if (e.button && e.button !== 0) return;
    held = false; moved = false; x0 = e.clientX; y0 = e.clientY;
    clearTimeout(timer); timer = setTimeout(() => { held = true; if (navigator.vibrate) navigator.vibrate(15); onHold(); }, 500);
  };
  const cancel = () => { clearTimeout(timer); timer = null; };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointermove', e => { if (Math.abs(e.clientX - x0) > 10 || Math.abs(e.clientY - y0) > 10) { moved = true; cancel(); } });
  el.addEventListener('pointerup', e => { if (timer && !held && !moved) onTap(e); cancel(); });
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('click', e => e.preventDefault());
}
/** Col dito il pulsante scatta appena si solleva il dito (tocco breve e fermo), senza il click sintetizzato: più pronto dopo uno swipe. */
function tapFast(el) {
  let t0 = 0, x = 0, y = 0;
  el.addEventListener('touchstart', e => { t0 = Date.now(); x = e.touches[0].clientX; y = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', e => {
    const c = e.changedTouches[0];
    if (Date.now() - t0 < 400 && Math.abs(c.clientX - x) < 12 && Math.abs(c.clientY - y) < 12) { e.preventDefault(); el.onclick(e); }
  }, { passive: false });
}

// ---------------------------------------------------------------- navigazione
const views = {};
const viewCache = {};   // ultimo HTML di ogni sezione: lo swipe mostra subito quello, poi lo aggiorna
let skipNextRender = false;
let swipeHash = false;  // cambio di #sezione fatto dallo swipe: non chiude una finestra appena aperta (es. il + toccato subito dopo)
let renderGen = 0, lastRender = Promise.resolve();
function navigate() {
  let v = (location.hash || '#' + CFG.home).slice(1).split('?')[0];
  if (CFG.aliases[v]) v = CFG.aliases[v];
  S.view = views[v] ? v : CFG.home;
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.v === S.view));
  const on = document.querySelector('nav a.on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  const fab = $('fab'); if (fab) fab.hidden = CFG.fab ? !CFG.fab.includes(S.view) : CFG.noFab.includes(S.view);
  if (H.onNavigate) try { H.onNavigate(S.view); } catch (e) { console.error(e); }
  if (skipNextRender) { skipNextRender = false; return; }   // lo swipe ha già disegnato la sezione
  render();
}
window.addEventListener('hashchange', () => { if (!swipeHash) closeModal(); swipeHash = false; navigate(); });
function render() { lastRender = renderNow(); return lastRender; }
async function renderNow() {
  const gen = ++renderGen;
  const el = $('view');
  try {
    const html = await views[S.view](gen);
    if (gen !== renderGen) return;
    if (typeof html === 'string') { el.innerHTML = html; viewCache[S.view] = html; }
    if (views[S.view].after) views[S.view].after();
  } catch (e) {
    if (gen !== renderGen) return;
    el.innerHTML = `<div class="panel empty">${esc(e.message)}</div>`;
  }
}

// ---------------------------------------------------------------- app Android: versione e pulsante "Aggiorna app"
function appVersion() { if (!CFG.ua) return null; const m = navigator.userAgent.match(new RegExp(CFG.ua + '/([\\d.]+)')); return m ? m[1] : null; }
function verGt(a, b) { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }
async function appUpdateInfo() {
  const mine = appVersion(); if (!mine) return null;
  try { const s = await get('/api/app'); return { mine, server: s.version, newer: s.version && verGt(s.version, mine), size: s.size }; } catch (e) { return null; }
}
/** App Android: se sul server c'è una versione più nuova, in alto al posto del nome compare "Aggiorna app". */
function showAppUpdBtn(a) {
  const brand = document.querySelector('header .brand'); if (!brand || !a || !a.newer || $('appUpdBtn')) return;
  const b = document.createElement('button'); b.type = 'button'; b.id = 'appUpdBtn'; b.className = 'app-upd-btn';
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>Aggiorna app ' + esc(a.server);
  b.onclick = () => { toast('Download dell\'aggiornamento…'); if (app && app.updateApp) app.updateApp('/api/app/download'); else location.href = '/api/app/download'; };
  brand.innerHTML = ''; brand.appendChild(b);
}

// ---------------------------------------------------------------- utente in alto a destra: tema, password, server, esci
(function () {
  const btn = $('uBtn'), drop = $('uDrop'); if (!btn || !drop) return;
  const theme = () => document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const setTheme = t => {
    if (t === 'light') document.documentElement.setAttribute('data-theme', 'light'); else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('theme', t); } catch (e) {}
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'light' ? '#f3f5f8' : '#0d1014';
    $('uTheme').textContent = t === 'light' ? 'chiaro' : 'scuro';
    if (H.onTheme) try { H.onTheme(t); } catch (e) {}
  };
  $('uTheme').textContent = theme() === 'light' ? 'chiaro' : 'scuro';
  const close = () => { drop.hidden = true; btn.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
  const open = () => {
    if (drop.parentElement !== document.body) document.body.appendChild(drop);   // fuori dalla barra: la posizione fissa è rispetto allo schermo
    const r = btn.getBoundingClientRect();
    drop.style.top = (r.bottom + 6) + 'px'; drop.style.right = Math.max(8, document.documentElement.clientWidth - r.right) + 'px'; drop.style.left = 'auto';
    drop.hidden = false; btn.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
  };
  btn.onclick = e => { e.stopPropagation(); if (drop.hidden) open(); else close(); };
  window.addEventListener('resize', () => { if (!drop.hidden) close(); });
  document.addEventListener('click', e => { if (!drop.hidden && !e.target.closest('.umenu, .udrop')) close(); });
  drop.querySelector('[data-u=theme]').onclick = () => { setTheme(theme() === 'light' ? 'dark' : 'light'); };
  if (app && app.changeServer && $('uServer')) { $('uServer').hidden = false; $('uServer').onclick = () => { close(); app.changeServer(); }; }
  window.setUserMenu = name => { if (!name) return; $('uAv').textContent = name.slice(0, 1).toUpperCase(); };
})();

// ---------------------------------------------------------------- gesti col dito: scorri a destra/sinistra = cambia sezione, trascina in giù = aggiorna
// Un gesto solo alla volta: la prima direzione decisa (orizzontale o verticale) vince.
function gestures() {
  if (!('ontouchstart' in window)) return;
  document.documentElement.classList.add('ptr-on');           // niente "ricarica" nativo del browser: lo faccio io
  const el = document.createElement('div'); el.id = 'ptr'; el.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"/></svg>'; document.body.appendChild(el);
  const MAX = 90, GO = 64;
  const view = () => $('view');
  let x0 = null, y0 = null, t0 = 0, mode = null, d = 0, dx = 0, busy = false;
  let pendingCommit = null;   // cambio sezione in corso: un nuovo tocco lo completa subito, così gli swipe rapidi uno dietro l'altro non si perdono
  // pagina "a fianco": la sezione verso cui si sta andando, già disegnata accanto a quella attuale
  let side = null, sideView = null, sideDir = 0;
  const order = () => [...document.querySelectorAll('nav a')].map(a => a.dataset.v);
  const set = (h, anim) => { el.style.transition = anim ? 'transform .2s, opacity .2s' : 'none'; el.style.transform = `translate(-50%, ${h - 50}px) rotate(${h * 4}deg)`; el.style.opacity = Math.min(1, h / GO); el.classList.toggle('ready', h >= GO); };
  const W = () => document.documentElement.clientWidth;
  const place = (x, anim) => {
    const v = view(); const tr = anim ? 'transform .2s cubic-bezier(.2,.7,.3,1)' : 'none';
    v.style.transition = tr; v.style.transform = x ? `translateX(${x}px)` : '';
    if (side) { side.style.transition = tr; side.style.transform = `translateX(${x + sideDir * W()}px)`; }
  };
  const dropSide = () => { if (side) { side.remove(); side = null; sideView = null; sideDir = 0; } };
  const makeSide = (name, dir) => {
    dropSide();
    const v = view(); const main = v.parentElement;
    side = document.createElement('div'); side.className = 'snap'; sideView = name; sideDir = dir;
    side.style.cssText = `position:absolute;left:0;right:0;top:0;transform:translateX(${dir * W()}px);transition:none;pointer-events:none;min-height:60vh`;
    if (viewCache[name]) side.innerHTML = viewCache[name];   // subito l'ultima versione vista…
    main.appendChild(side);
    Promise.resolve().then(() => views[name](0)).then(html => { if (typeof html === 'string') { viewCache[name] = html; if (side && sideView === name) side.innerHTML = html; } })   // …poi quella fresca
      .catch(e => { if (side && sideView === name && !viewCache[name]) side.innerHTML = `<div class="panel empty">${esc(e.message)}</div>`; });
  };
  window.addEventListener('touchstart', e => {
    x0 = null;
    if (pendingCommit) pendingCommit();
    if (busy || e.touches.length !== 1 || $('modal').classList.contains('open')) return;
    const tch = e.touches[0];
    if (tch.target.closest('.udrop, .umenu')) return;   // tocco dentro il menu utente: è un clic sulle voci, non un gesto
    const ud = $('uDrop'); if (ud && !ud.hidden) { ud.hidden = true; $('uBtn').classList.remove('open'); }   // menu aperto e tocco fuori: si chiude e il gesto prosegue
    if (tch.target.closest('nav, input, textarea, select')) return;   // solo la barra delle sezioni e i campi: tutto il resto si swipa
    x0 = tch.clientX; y0 = tch.clientY; t0 = Date.now(); mode = null; d = 0; dx = 0;
  }, { passive: true });
  window.addEventListener('touchmove', e => {
    if (x0 == null) return;
    const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
    if (!mode) {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;   // decido la direzione dopo pochi pixel: lo swipe risponde subito
      if (Math.abs(mx) > Math.abs(my) * 0.8) {
        // orizzontale: non dal bordo estremo (lì resta il gesto "indietro" del telefono)
        const w = W(); mode = (x0 > w * 0.1 && x0 < w * 0.9) ? 'swipe' : 'none';
      } else mode = (my > 0 && window.scrollY <= 0) ? 'pull' : 'none';
    }
    if (mode === 'pull') {
      if (my <= 0 || window.scrollY > 0) { if (d) set(0, true); d = 0; return; }
      d = Math.min(MAX, my * 0.5); set(d);
    } else if (mode === 'swipe') {
      const o = order(); let i = o.indexOf(S.view);
      if (i < 0) { const on = document.querySelector('nav a.on'); i = on ? o.indexOf(on.dataset.v) : -1; }   // sotto-pagine: parto dalla sezione evidenziata
      const dir = mx < 0 ? 1 : -1, j = i + dir;
      const edge = j < 0 || j >= o.length;
      if (edge) { dropSide(); dx = 0; place(0, false); return; }   // prima/ultima sezione: niente da scorrere
      dx = mx;
      // la sezione a fianco compare subito accanto a quella attuale e segue il dito
      if (sideView !== o[j] || sideDir !== dir) makeSide(o[j], dir);
      place(dx, false);
      if (e.cancelable) e.preventDefault();   // swipe laterale: la pagina non scorre anche in verticale
    }
  }, { passive: false });
  window.addEventListener('touchcancel', () => {
    if (x0 == null) return;
    x0 = null;
    if (mode === 'swipe') { place(0, true); setTimeout(() => { dropSide(); const v = view(); v.style.transition = ''; v.style.transform = ''; }, 220); }
    if (mode === 'pull') { set(0, true); d = 0; }
    mode = null;
  }, { passive: true });
  window.addEventListener('touchend', () => {
    if (x0 == null) return;
    x0 = null;
    if (mode === 'pull') {
      if (d < GO) { set(0, true); d = 0; return; }
      busy = true; el.classList.add('spin'); set(GO, true);
      (async () => {
        try { if (H.onPull) await H.onPull(); await H.load(); await render(); toast('Aggiornato'); } catch (e) { toast(e.message, true); }
        el.classList.remove('spin'); set(0, true); busy = false; d = 0;
      })();
      return;
    }
    if (mode !== 'swipe') return;
    const o = order(); let i = o.indexOf(S.view);
    if (i < 0) { const on = document.querySelector('nav a.on'); i = on ? o.indexOf(on.dataset.v) : -1; }
    const dir = dx < 0 ? 1 : -1, j = i + dir;
    const fast = Date.now() - t0 < 300 && Math.abs(dx) > 15;   // colpetto veloce: basta poco
    if (!side || sideView !== o[j] || (Math.abs(dx) < 35 && !fast)) {
      place(0, true); setTimeout(() => { dropSide(); const v = view(); v.style.transition = ''; v.style.transform = ''; }, 220); return;
    }
    // completo lo scorrimento: la pagina a fianco arriva al centro, poi diventa la sezione corrente
    busy = true;
    const v = view(), name = o[j], done = side;
    // la barra in alto segna subito la sezione nuova, mentre le pagine finiscono la corsa
    document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.v === name));
    const na = document.querySelector(`nav a[data-v="${name}"]`); if (na) na.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    place(-dir * W(), true);
    const commit = () => {
      if (pendingCommit !== commit) return;
      pendingCommit = null;
      try {
        S.view = name; ++renderGen;
        v.style.transition = 'none'; v.style.transform = '';
        v.innerHTML = done.innerHTML;
        dropSide();
        try { if (views[name].after) views[name].after(); } catch (e) { console.error(e); }
        if (location.hash === '#' + name) navigate();
        else { skipNextRender = true; swipeHash = true; location.hash = '#' + name; setTimeout(() => { skipNextRender = false; swipeHash = false; }, 300); }
      } finally { busy = false; }
    };
    pendingCommit = commit;
    setTimeout(commit, 210);
  });
}

// ---------------------------------------------------------------- aggiornamento dal vivo: il server avvisa quando i dati cambiano (SSE)
// Tollera le disconnessioni: si riconnette da solo con attese crescenti e, al rientro, ridisegna.
// Se il server riparte con una versione nuova, la pagina si ricarica da sola.
function live() {
  let es = null, timer = null, retry = 1000, last = null, pending = false;
  const editing = () => { const a = document.activeElement; return $('modal').classList.contains('open') || (a && a.closest && a.closest('#view') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); };
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (editing()) { pending = true; return; }   // non interrompo chi sta scrivendo: aggiorno dopo
      pending = false;
      try { await H.load(); await render(); } catch (e) {}
    }, 200);
  };
  function connect() {
    if (es) { try { es.close(); } catch (e) {} }
    es = new EventSource('/api/events');
    es.onopen = () => { setLive(true); retry = 1000; };
    es.addEventListener('version', e => { if (window.__srvVer && window.__srvVer !== e.data) { toast(CFG.name + ' aggiornato: ricarico…'); setTimeout(() => location.reload(), 600); return; } window.__srvVer = e.data; });
    es.addEventListener('hello', e => { if (last !== null && last !== e.data) refresh(); last = e.data; });   // tornato online: qualcosa può essere cambiato
    es.addEventListener('changed', e => { last = e.data; refresh(); });
    es.onerror = () => { setLive(false); try { es.close(); } catch (e) {} es = null; setTimeout(connect, retry); retry = Math.min(retry * 2, 10000); };
  }
  connect();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (!es) connect(); else refresh(); if (H.onVisible) try { H.onVisible(); } catch (e) {} } });
  // finita la modifica (modale chiusa / campo lasciato): se nel frattempo è cambiato qualcosa, ridisegno
  document.addEventListener('focusout', () => { if (pending) refresh(); });
  const mo = new MutationObserver(() => { if (pending && !$('modal').classList.contains('open')) refresh(); });
  mo.observe($('modal'), { attributes: true, attributeFilter: ['class'] });
}

// ---------------------------------------------------------------- avvio
/** cfg: { load: async () => {…dati di base…}, currency: () => '€', onForm(form, fields, vals), onNavigate(view),
 *         onPull: async () => {…}, onVisible: () => {…}, afterLoad: () => {…}, onTheme(t), fab: () => {…} } */
async function start(cfg) {
  Object.assign(H, cfg || {});
  if (!H.load) H.load = async () => { S.settings = await get('/api/settings'); };
  const fab = $('fab'); if (fab && H.fab) { fab.onclick = H.fab; tapFast(fab); }
  try { await H.load(); if (S.settings && S.settings.username && window.setUserMenu) setUserMenu(S.settings.username); setLive(true); }
  catch (e) { $('view').innerHTML = `<div class="panel empty">${esc(e.message)}</div>`; return; }
  if (H.afterLoad) try { H.afterLoad(); } catch (e) { console.error(e); }
  navigate();
  gestures();
  live();
  appUpdateInfo().then(showAppUpdBtn);
  // sezioni pronte di lato per lo swipe: le preparo in sottofondo
  if ('ontouchstart' in window) setTimeout(() => { [...document.querySelectorAll('nav a')].map(a => a.dataset.v).filter(v => v !== S.view).forEach(v => Promise.resolve().then(() => views[v](0)).then(h => { if (typeof h === 'string') viewCache[v] = h; }).catch(() => {})); }, 1500);
}

Object.assign(window, { $, esc, css, app, S, api, get, setLive, toast, openModal, closeModal, choose, confirmDel, formModal, COLORS, tapAndHold, tapFast, views, viewCache, navigate, render, appVersion, verGt, appUpdateInfo });
window.Shell = { cfg: CFG, start, version: '0.1.1' };
})();
