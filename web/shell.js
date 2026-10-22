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

const CFG = Object.assign({ name: 'App', csrf: 'X-App', ua: null, unit: null, home: 'home', fab: null, noFab: [], aliases: {}, live: true, events: '/api/events', bare: false }, window.SHELL || {});
// bare: true → app a pagina unica (es. SMap, una mappa a tutto schermo): niente sezioni (#view, nav, #sezione), niente gesti
// di scorrimento né SSE del guscio; restano menu utente, tema, finestre, avvisi, api, aggiornamento app.
const H = {};   // ganci dell'app (da Shell.start)
const anyModal = () => $('modal').classList.contains('open') || !!(H.modalOpen && H.modalOpen());   // finestra del guscio o finestre proprie dell'app

// nessun campo propone testi già scritti (il riquadro dei suggerimenti chiude la tastiera nell'app)
(function () {
  // (mai dentro gli editor di testo: lì una modifica agli attributi fa ridisegnare il pezzo, all'infinito)
  const off = el => { if (el.matches && el.matches('input:not([type=hidden]),textarea,form') && el.getAttribute('autocomplete') !== 'off' && !el.closest('[contenteditable], .ProseMirror, .cm-editor, .bn-container')) { el.setAttribute('autocomplete', 'off'); if (el.tagName !== 'FORM') { el.setAttribute('autocorrect', 'off'); if (el.type !== 'number' && el.type !== 'date') el.setAttribute('spellcheck', 'false'); } } };
  const scan = root => { off(root); root.querySelectorAll && root.querySelectorAll('input,textarea,form').forEach(off); };
  scan(document.body);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && scan(n)))).observe(document.body, { childList: true, subtree: true });
})();

// App Android: le barre di sistema (stato in cima, navigazione in fondo) prendono il colore della pagina che c'è sotto
(function () {
  const A = window.AndroidApp; if (!A || !A.barColors) return;
  const hex = c => { const m = String(c).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/); if (!m || (m[4] != null && +m[4] === 0)) return null; return '#' + [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join(''); };
  const colorAt = y => {
    let el = document.elementFromPoint(innerWidth / 2, y);
    while (el && el !== document.documentElement) { const h = hex(getComputedStyle(el).backgroundColor); if (h) return h; el = el.parentElement; }
    return hex(getComputedStyle(document.body).backgroundColor) || '#0d1014';
  };
  let last = '', t = null;
  const sync = () => { t = null; const top = colorAt(1), bottom = colorAt(innerHeight - 2), k = top + bottom; if (k !== last) { last = k; try { A.barColors(top, bottom); } catch (e) {} } };
  const later = () => { if (!t) t = setTimeout(sync, 120); };
  new MutationObserver(later).observe(document.documentElement, { attributes: true, subtree: true, childList: true, attributeFilter: ['class', 'style', 'data-theme', 'hidden'] });
  addEventListener('resize', later); addEventListener('scroll', later, { passive: true }); addEventListener('load', later);
  later();
})();

// animazioni continue (rotelline, pulsazioni): tutte agganciate allo stesso orologio della pagina, così quando
// un aggiornamento ridisegna il pezzo l'animazione prosegue dal punto in cui era invece di ripartire da capo
(function () {
  if (!document.getAnimations) return;
  let queued = false;
  const sync = () => {
    queued = false;
    for (const a of document.getAnimations()) {
      try {
        // non il cursore di scrittura (deve ripartire acceso a ogni clic) né i campi degli editor
        const el = a.effect && a.effect.target;
        if (el && el.closest && el.closest('.cm-editor, .cm-cursorLayer, [contenteditable]')) continue;
        if (a.effect && a.effect.getComputedTiming().iterations === Infinity && a.startTime !== 0 && a.playState === 'running') a.startTime = 0;
      } catch (e) { /* animazione già finita */ }
    }
  };
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(sync); } };
  new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  later();
})();

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const app = window.AndroidApp;

// ---------------------------------------------------------------- stato condiviso
const S = { settings: null, view: CFG.home };

// ---------------------------------------------------------------- api
let apiFails = 0, lostTimer = null;
/** Il server non risponde: di solito si sta riavviando (aggiornamento). Aspetto in silenzio che torni, provando ogni 1,5 s;
 *  solo se dopo 45 s è ancora giù lo dico all'app (che mostra la schermata del server). */
function serverLost() {
  if (lostTimer) return;
  setLive(false);
  const t0 = Date.now();
  const probe = async () => {
    try { const r = await fetch('/api/version', { cache: 'no-store', credentials: 'same-origin' }); if (r.ok) { lostTimer = null; apiFails = 0; setLive(true); return; } } catch (e) {}
    if (Date.now() - t0 > 45000) { lostTimer = null; if (app && app.connectionLost) try { app.connectionLost(); } catch (_) {} return; }
    lostTimer = setTimeout(probe, 1500);
  };
  lostTimer = setTimeout(probe, 1500);
}
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
    if (++apiFails >= 2) serverLost();
    throw new Error('Server non raggiungibile');
  }
  apiFails = 0;
  if (res.status === 401) { location.href = '/login'; throw new Error('sessione scaduta'); }
  if (res.status === 502 || res.status === 503 || res.status === 504) serverLost();   // proxy davanti al server che si riavvia
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
// chiude toccando lo sfondo, ma solo se il tocco è iniziato lì: trascinare una selezione e lasciare fuori non chiude
function backdropClose(el, close) {
  let down = false;
  el.addEventListener('pointerdown', e => { down = e.target === el; });
  el.addEventListener('click', e => { if (e.target === el && down) close(); down = false; });
}
backdropClose($('modal'), closeModal);
// Finestre aperte (quella del guscio e quelle proprie dell'app: ogni .modal che prende la classe .open): Esc da PC e Indietro nell'app
// chiudono sempre l'ultima aperta.
const openStack = [];
new MutationObserver(ms => ms.forEach(m => {
  const el = m.target; if (!(el.classList && el.classList.contains('modal'))) return;
  const i = openStack.indexOf(el);
  if (el.classList.contains('open')) { if (i >= 0) openStack.splice(i, 1); openStack.push(el); }
  else if (i >= 0) openStack.splice(i, 1);
  document.documentElement.classList.toggle('modal-on', openStack.length > 0);   // finestra aperta: la pagina sotto resta ferma
})).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
function closeTop() {
  if (xselClose()) return true;
  if (userMenuOpen()) { closeUserMenu(true); return true; }
  const el = openStack[openStack.length - 1]; if (!el) return false;
  if (el.id === 'modal') closeModal(); else { el.classList.remove('open'); if (el.id === 'modal2') $('modalBox2').innerHTML = ''; }
  return true;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented && (xselIsOpen() || openStack.length || userMenuOpen())) { e.preventDefault(); closeTop(); } });
window.appBack = () => closeTop();

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
    if (f.type === 'check') return `<div class="${f.full ? 'full' : ''}" data-f="${f.k}"><label class="chk"><input type="checkbox" name="${f.k}" ${f.v ? 'checked' : ''}> ${esc(f.l)}</label></div>`;
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
    return `<div class="${f.full ? 'full' : ''}" data-f="${f.k}"><label>${esc(f.l)}</label>${inp}${f.hint ? `<div class="hint">${f.hint}</div>` : ''}</div>`;
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

// altezza della barra in alto (--toph): le barre fissate negli elenchi (ricerca) restano subito sotto
(function () {
  const top = document.querySelector('.top'); if (!top || !window.ResizeObserver) return;
  const set = () => document.documentElement.style.setProperty('--toph', top.offsetHeight + 'px');
  new ResizeObserver(set).observe(top); set();
})();

// ---------------------------------------------------------------- copia negli appunti
/** Copia un testo negli appunti (anche senza HTTPS). Ritorna true se riuscito. */
function copyText(t) {
  const legacy = () => { const a = document.createElement('textarea'); a.value = t; a.setAttribute('readonly', ''); a.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(a); a.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) {} a.remove(); return ok; };
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(() => true, legacy);
  return Promise.resolve(legacy());
}
// Elementi con data-copy (IBAN, indirizzi…): clic o tocco = copia. Manina come cursore, niente sottolineature.
// data-copy="testo" (vuoto = il testo dell'elemento). Nell'app Android l'avviso "Copiato" lo mostra già il sistema.
document.addEventListener('click', async e => {
  const el = e.target.closest && e.target.closest('[data-copy]'); if (!el) return;
  e.preventDefault(); e.stopPropagation();
  const t = (el.dataset.copy || el.textContent).trim(); if (!t) return;
  const ok = await copyText(t);
  el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 1200);
  if (!ok) toast('Non riesco a copiare: ' + t, true); else if (!app) toast('Copiato: ' + t);
}, true);

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

// ---------------------------------------------------------------- tendine grafiche al posto di quelle di sistema
// Ogni <select> della pagina diventa un pulsante con la sua tendina (da PC sotto al campo, sul telefono un pannello dal basso).
// Il <select> vero resta, nascosto: valore, FormData e gli onchange delle app funzionano come prima.
let xselCur = null;   // { sel, pop }
const xselIsOpen = () => !!xselCur;
function xselClose() {
  if (!xselCur) return false;
  const { pop, btn } = xselCur; xselCur = null;
  pop.classList.remove('in'); btn.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
  setTimeout(() => pop.remove(), 140);
  return true;
}
function xselLabel(sel) {
  const o = sel.options[sel.selectedIndex];
  return o ? o.textContent : '';
}
function xselSync(sel) {
  const b = sel._xbtn; if (!b) return;
  b.querySelector('.xsel-v').textContent = xselLabel(sel) || '—'; b.disabled = sel.disabled;
  // larghezza fissa: il pulsante è largo quanto la voce più lunga, così non cambia misura scegliendo un'altra voce
  const sz = b.querySelector('.xsel-sz'); if (!sz) return;
  const labels = sel.options.length <= 80 ? [...sel.options].map(o => o.textContent) : [];
  const key = labels.join('\n'); if (sz._k === key) return; sz._k = key;
  sz.innerHTML = labels.map(t => `<i>${esc(t)}</i>`).join('');
}
function xselOpen(sel) {
  xselClose();
  const btn = sel._xbtn, mobile = false, touch = document.documentElement.clientWidth <= 640;   // sempre a tendina sotto il tasto (niente pannello dal basso)
  const pop = document.createElement('div'); pop.className = 'xsel-pop' + (mobile ? ' sheet' : '') + (touch ? ' touch' : ''); pop.setAttribute('role', 'listbox');
  const lbl = (sel.closest('div, label') && sel.closest('div, label').querySelector('label')) ? sel.closest('div, label').querySelector('label').textContent.trim() : '';
  let html = mobile && lbl ? `<div class="xsel-title">${esc(lbl)}</div>` : '';
  html += '<div class="xsel-list">';
  [...sel.children].forEach(ch => {
    if (ch.tagName === 'OPTGROUP') { html += `<div class="xsel-grp">${esc(ch.label)}</div>`; [...ch.children].forEach(o => html += opt(o)); }
    else html += opt(ch);
  });
  function opt(o) {
    const on = o.selected;
    return `<button type="button" role="option" class="xsel-o${on ? ' on' : ''}" data-i="${o.index}" ${o.disabled ? 'disabled' : ''} aria-selected="${on}"><span>${esc(o.textContent)}</span>${on ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : ''}</button>`;
  }
  html += '</div>';
  pop.innerHTML = html;
  document.body.appendChild(pop);
  if (!mobile) {
    const r = btn.getBoundingClientRect(), vh = window.innerHeight;
    pop.style.minWidth = r.width + 'px'; pop.style.left = Math.max(8, Math.min(r.left, document.documentElement.clientWidth - Math.max(r.width, pop.offsetWidth) - 8)) + 'px';
    const below = vh - r.bottom - 12, above = r.top - 12;
    if (below >= Math.min(pop.offsetHeight, 260) || below >= above) { pop.style.top = (r.bottom + 6) + 'px'; pop.style.maxHeight = Math.max(160, below) + 'px'; }
    else { pop.style.bottom = (vh - r.top + 6) + 'px'; pop.style.maxHeight = Math.max(160, above) + 'px'; pop.classList.add('up'); }
  }
  xselCur = { sel, pop, btn };
  btn.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => pop.classList.add('in'));
  const cur = pop.querySelector('.xsel-o.on') || pop.querySelector('.xsel-o:not([disabled])');
  if (cur) { cur.scrollIntoView({ block: 'nearest' }); if (!('ontouchstart' in window)) cur.focus(); }
  pop.addEventListener('click', e => {
    const b = e.target.closest('.xsel-o'); if (!b || b.disabled) return;
    const i = +b.dataset.i; const changed = sel.selectedIndex !== i;
    sel.selectedIndex = i; xselSync(sel); xselClose(); btn.focus();
    if (changed) { sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  pop.addEventListener('keydown', e => {
    const os = [...pop.querySelectorAll('.xsel-o:not([disabled])')], i = os.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (os[i + 1] || os[0]).focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (os[i - 1] || os[os.length - 1]).focus(); }
    if (e.key === 'Tab') { xselClose(); }
  });
}
function xselEnhance(sel) {
  if (sel._xbtn || sel.multiple || sel.size > 1 || sel.closest('.xsel-skip')) return;
  const cs = getComputedStyle(sel);
  // HTML rimesso da una copia salvata (swipe, ritorno su una sezione): il pulsante c'è già accanto al select → lo riuso,
  // e tolgo eventuali doppioni, invece di aggiungerne un altro a ogni passaggio
  const stale = [];
  for (let n = sel.nextElementSibling; n && n.classList.contains('xsel-btn') && !n._xsel; n = n.nextElementSibling) stale.push(n);
  if (stale[0] && !stale[0].querySelector('.xsel-sz')) stale.shift().remove();   // copia di una versione precedente: lo rifaccio
  let btn = stale.shift() || null; stale.forEach(n => n.remove());
  if (!btn) {
    btn = document.createElement('button'); btn.type = 'button'; btn.className = 'xsel-btn ' + sel.className.replace(/\bxsel-native\b/, '').trim(); btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    if (sel.id) btn.dataset.for = sel.id;
    btn.innerHTML = '<span class="xsel-box"><span class="xsel-v"></span><span class="xsel-sz" aria-hidden="true"></span></span><svg class="xsel-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
    if (sel.getAttribute('style')) btn.setAttribute('style', sel.getAttribute('style'));
    if (cs.flexGrow !== '0') btn.style.flexGrow = cs.flexGrow;
    sel.after(btn);
  }
  btn.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
  sel.classList.add('xsel-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
  sel._xbtn = btn; btn._xsel = sel;
  // valore cambiato dal codice (sel.value = …, opzioni riscritte): il pulsante si aggiorna da solo
  const proto = HTMLSelectElement.prototype;
  for (const k of ['value', 'selectedIndex']) {
    const d = Object.getOwnPropertyDescriptor(proto, k);
    Object.defineProperty(sel, k, { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); xselSync(this); } });
  }
  new MutationObserver(() => xselSync(sel)).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected'] });
  sel.addEventListener('change', () => xselSync(sel));
  btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (xselCur && xselCur.sel === sel) xselClose(); else xselOpen(sel); });
  btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); xselOpen(sel); } });
  xselSync(sel);
}
function xselScan(root) {
  (root.matches && root.matches('select') ? [root] : [...(root.querySelectorAll ? root.querySelectorAll('select') : [])]).forEach(xselEnhance);
  if (root.querySelectorAll) root.querySelectorAll('.xsel-btn').forEach(b => { if (!b._xsel) b.remove(); });   // orfani di copie vecchie
}
xselScan(document.body);
new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && xselScan(n)))).observe(document.body, { childList: true, subtree: true });
document.addEventListener('pointerdown', e => { if (xselCur && !e.target.closest('.xsel-pop') && e.target.closest('.xsel-btn') !== xselCur.btn) xselClose(); }, true);
window.addEventListener('resize', () => xselClose());
window.addEventListener('scroll', e => { if (xselCur && !(e.target && e.target.closest && e.target.closest('.xsel-pop'))) xselClose(); }, true);
// clic sull'etichetta del campo: apre la tendina (come faceva il select)
document.addEventListener('click', e => { const l = e.target.closest('label'); if (!l) return; const s = l.querySelector('select.xsel-native') || (l.htmlFor && $(l.htmlFor)); if (s && s._xbtn && !e.target.closest('.xsel-btn')) { e.preventDefault(); xselOpen(s); } });

// ---------------------------------------------------------------- navigazione
const views = {};
const viewCache = {};   // ultimo HTML di ogni sezione (già riempito): lo swipe mostra subito quello
const scrollPos = {};   // posizione di scorrimento di ogni sezione: si torna dov'eri
const dirty = {};       // sezioni la cui copia è vecchia (il server ha segnalato dati cambiati): si rifanno in sottofondo
let prefetching = false;
/** Rifà in sottofondo le copie delle sezioni non a schermo rimaste indietro, una alla volta, senza toccare la pagina. */
async function prefetchDirty() {
  if (prefetching) return; prefetching = true;
  try {
    for (const v of Object.keys(views)) {
      if (v === S.view || !dirty[v] || views[v].static) continue;
      try { const h = await views[v](0); if (typeof h === 'string') viewCache[v] = h; dirty[v] = false; } catch (e) {}
    }
  } finally { prefetching = false; }
}
let skipNextRender = false;
let swipeHash = false;  // cambio di #sezione fatto dallo swipe: non chiude una finestra appena aperta (es. il + toccato subito dopo)
let renderGen = 0, lastRender = Promise.resolve();
function navigate() {
  let v = (location.hash || '#' + CFG.home).slice(1).split('?')[0];
  if (CFG.aliases[v]) v = CFG.aliases[v];
  const prev = S.view;
  S.view = views[v] ? v : CFG.home;
  const changed = prev !== S.view;
  if (changed) { scrollPos[prev] = window.scrollY; const cur = $('view'); if (cur && cur.innerHTML && !cur.style.transform) viewCache[prev] = cur.innerHTML; }   // la sezione che lascio, così com'è (gruppi aperti…)
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.v === S.view));
  const on = document.querySelector('nav a.on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  const fab = $('fab'); if (fab) fab.hidden = CFG.fab ? !CFG.fab.includes(S.view) : CFG.noFab.includes(S.view);
  if (H.onNavigate) try { H.onNavigate(S.view); } catch (e) { console.error(e); }
  if (skipNextRender) { skipNextRender = false; return; }   // lo swipe ha già disegnato la sezione
  render().then(() => { if (changed) window.scrollTo(0, scrollPos[S.view] || 0); });
}
window.addEventListener('hashchange', () => { if (CFG.bare) return; if (!swipeHash) closeModal(); swipeHash = false; navigate(); });
// passare da una sezione all'altra (pillole in alto, link interni "#sezione") sostituisce l'indirizzo invece di aggiungerne uno:
// Indietro (browser o app) non ripercorre le sezioni, chiude le finestre o esce
document.addEventListener('click', e => {
  if (CFG.bare) return;
  const a = e.target.closest('a[href^="#"]'); if (!a || e.defaultPrevented || e.ctrlKey || e.metaKey) return;
  const h = a.getAttribute('href'); if (h.length < 2) return;
  e.preventDefault(); if (location.hash !== h) location.replace(h);
});
function render() { lastRender = renderNow(); return lastRender; }
/** Ridisegna la sezione lasciando al suo posto il campo in cui si sta scrivendo (stesso elemento: niente tastiera che si chiude,
 *  niente tocchi che finiscono su altro). Cambia tutto il resto. false = struttura diversa, va ridisegnata da capo. */
function patchKeeping(el, html, keep) {
  const tpl = document.createElement('template'); tpl.innerHTML = html;
  const neu = tpl.content.querySelector('#' + CSS.escape(keep.id)); if (!neu || neu.tagName !== keep.tagName) return false;
  const oldChain = [], newChain = [];
  for (let n = keep; n && n !== el; n = n.parentNode) oldChain.unshift(n);
  for (let n = neu; n && n !== tpl.content; n = n.parentNode) newChain.unshift(n);
  if (oldChain.length !== newChain.length || oldChain.some((o, i) => o.tagName !== newChain[i].tagName)) return false;
  let pOld = el, pNew = tpl.content;
  oldChain.forEach((o, i) => {
    const n = newChain[i];
    [...pOld.childNodes].forEach(c => { if (c !== o) c.remove(); });
    const before = [], after = []; let seen = false;
    [...pNew.childNodes].forEach(c => { if (c === n) seen = true; else (seen ? after : before).push(c); });
    o.before(...before); o.after(...after);
    if (o !== keep) {   // contenitori del campo: prendono classi e attributi nuovi
      [...o.attributes].forEach(a => { if (!n.hasAttribute(a.name)) o.removeAttribute(a.name); });
      [...n.attributes].forEach(a => o.setAttribute(a.name, a.value));
    }
    pOld = o; pNew = n;
  });
  return true;
}
async function renderNow() {
  const gen = ++renderGen;
  const el = $('view'); if (!el) return;
  try {
    const html = await views[S.view](gen);
    if (gen !== renderGen) return;
    if (typeof html === 'string') {
      const a = document.activeElement;
      const keep = a && a.id && el.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !/^(checkbox|radio|file|button|submit)$/.test(a.type))) ? a : null;
      if (!keep || !patchKeeping(el, html, keep)) el.innerHTML = html;
    }
    if (views[S.view].after) views[S.view].after();
    if (typeof html === 'string') viewCache[S.view] = el.innerHTML;
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
// ---------------------------------------------------------------- "altre app" (catalogo pubblicato da SMonitor)
/** HTML del riquadro "Altre app" per le Impostazioni (vuoto se il catalogo non c'è o non include questa app).
 *  Icona = iniziale su riquadro colorato. Nell'app Android: installata → si apre, altrimenti si scarica l'APK;
 *  nel browser si scarica. */
async function otherApps() {
  let list = [];
  try { list = await (await fetch(CFG.appsUrl || '/api/apps', { cache: 'no-store', credentials: 'same-origin' })).json(); } catch (e) { return ''; }
  if (!Array.isArray(list)) return '';
  // questa app: SHELL.unit (es. "smoney.service"), altrimenti dal nome
  const me = CFG.unit || (CFG.name || '').toLowerCase() + '.service';
  const apps = list.filter(a => a.unit !== me && (!a.show_in || !a.show_in.trim() || a.show_in.split(',').map(x => x.trim()).includes(me)));
  if (!apps.length) return '';
  const inst = a => { try { return !!(app && app.isInstalled && a.pkg && app.isInstalled(a.pkg)); } catch (e) { return false; } };
  return `<section class="panel oapps"><div class="chead"><b>Altre app</b></div>
    <div class="oapps-grid">${apps.map(a => `<button type="button" class="oapp" data-id="${esc(a.id)}" data-pkg="${esc(a.pkg || '')}" data-url="${esc(a.url || '')}" data-apk="${a.apk ? '1' : ''}" title="${inst(a) ? 'Apri ' + esc(a.name) : a.apk ? 'Scarica ' + esc(a.name) : esc(a.name)}">
      <span class="oapp-ic" style="background:${esc(a.color || '#7d8894')}">${esc((a.name || '?').replace(/^S/, '').slice(0, 1).toUpperCase())}</span>
      <span class="oapp-n">${esc(a.name)}</span><small>${inst(a) ? 'installata' : a.apk ? 'scarica' : 'sul server'}</small></button>`).join('')}</div></section>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('.oapp'); if (!b) return;
  const { id, pkg, url, apk } = b.dataset;
  if (app && app.isInstalled && pkg && app.isInstalled(pkg)) { app.openApp(pkg, url || ''); return; }
  if (apk) { toast('Scarico l\'app…'); if (app && app.updateApp) app.updateApp('/api/apps/' + id + '.apk'); else location.href = '/api/apps/' + id + '.apk'; return; }
  if (url) window.open(url, '_blank'); else toast('App non ancora disponibile', true);
});

// ---------------------------------------------------------------- sviluppatori: novità da testare (CHANGELOG per versione)
/** Se l'utente è sviluppatore (is_dev da /api/me), nel menu compare "Da testare" con il numero di voci non spuntate. */
async function devSetup() {
  let me = null;
  try { me = await (await fetch('/api/me', { cache: 'no-store', credentials: 'same-origin' })).json(); } catch (e) { return; }
  if (!me || !me.is_dev) return;
  const b = $('uDev'); if (!b) return;
  b.hidden = false;
  try {
    const d = await (await fetch('/api/dev/tests', { cache: 'no-store', credentials: 'same-origin' })).json();
    const left = (d.versions || []).reduce((n, v) => n + v.items.filter(i => !i.done).length, 0);
    const n = $('uDevN'); n.textContent = left; n.hidden = !left;
  } catch (e) {}
}
/** Finestra con le novità per versione e le spunte "testato" (salvate sul server, per utente). */
/** data e ora brevi (es. "22/10 14:05") da secondi unix */
function fmtDT(t) { return new Date(t * 1000).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ''); }
async function devList() {
  let d; try { d = await (await fetch('/api/dev/tests', { cache: 'no-store', credentials: 'same-origin' })).json(); } catch (e) { toast('Elenco non disponibile', true); return; }
  const vers = d.versions || [];
  openModal(`<h3>Da testare</h3><div class="sub">Novità e correzioni di ogni versione: spunta quelle che hai provato.</div>
    ${vers.length ? vers.map(v => `<div class="devver"><div class="devh"><b>${esc(v.version)}</b>${v.version === d.current ? '<span class="tag">installata</span>' : ''}${v.installed ? `<small class="devd" title="installata il">${fmtDT(v.installed)}</small>` : ''}<span class="spacer"></span><small>${v.items.filter(i => i.done).length}/${v.items.length}</small></div>
      ${v.items.map(i => `<label class="devit ${i.done ? 'on' : ''}"><input type="checkbox" data-v="${esc(v.version)}" data-n="${i.n}" ${i.done ? 'checked' : ''}><span>${esc(i.text)}</span></label>`).join('')}</div>`).join('')
      : '<div class="note">Niente da testare: il registro delle novità è vuoto.</div>'}
    <div class="btns"><button class="btn" type="button" id="devClose">Chiudi</button></div>`, 'devbox');
  $('devClose').onclick = closeModal;
  $('modalBox').querySelectorAll('.devit input').forEach(c => c.onchange = async () => {
    c.closest('.devit').classList.toggle('on', c.checked);
    try { await api('POST', '/api/dev/tests', { version: c.dataset.v, n: +c.dataset.n, done: c.checked }); } catch (e) { toast(e.message, true); c.checked = !c.checked; }
    const h = c.closest('.devver'); h.querySelector('.devh small').textContent = `${h.querySelectorAll('input:checked').length}/${h.querySelectorAll('input').length}`;
    const left = $('modalBox').querySelectorAll('.devit input:not(:checked)').length; const n = $('uDevN'); n.textContent = left; n.hidden = !left;
  });
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
// Pulsante = avatar (da PC anche il nome); la tendina è una scheda con intestazione, tema a interruttore e voci con icona.
// Il guscio costruisce tutto da solo dentro .umenu: le app non devono avere markup particolare.
const IC = {
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  keyboard: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
  key: '<path d="M15 7a3 3 0 1 1-3.6 2.9L4 17.3V20h2.7l1-1V17.5h1.5V16h1.6l1.2-1.2A3 3 0 0 1 15 7z"/><circle cx="16" cy="8" r="1"/>',
  server: '<rect x="4" y="4" width="16" height="6" rx="1.5"/><rect x="4" y="14" width="16" height="6" rx="1.5"/><path d="M8 7h.01M8 17h.01"/>',
  out: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  check: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M8 12.5l3 3 5-6"/>',
};
const svg = (p, c) => `<svg viewBox="0 0 24 24" class="${c || 'ic'}" aria-hidden="true">${p}</svg>`;
let closeUserMenu = () => {}, userMenuOpen = () => false;
(function () {
  const box = document.querySelector('.umenu'); if (!box) return;
  box.innerHTML = `<button type="button" class="ubtn" id="uBtn" aria-haspopup="menu" aria-expanded="false" title="Account"><span class="uname" id="uName"></span><span class="uav" id="uAv">?</span></button>`;
  const drop = document.createElement('div'); drop.className = 'udrop'; drop.id = 'uDrop'; drop.setAttribute('role', 'menu'); drop.hidden = true;
  drop.innerHTML = `<div class="uhead"><span class="uav lg" id="uAv2">?</span><div class="uwho"><b id="uName2">—</b><small>${esc(CFG.name)}</small></div></div>
    <div class="usep"></div>
    <button type="button" class="urow" id="uThemeRow" role="menuitemcheckbox"><span class="ulbl">${svg(IC.moon)}Tema</span><span class="useg" id="uTheme" aria-hidden="true">
      <span data-t="dark">${svg(IC.moon, 'ic sm')}</span><span data-t="light">${svg(IC.sun, 'ic sm')}</span></span></button>
    <a role="menuitem" class="uitem" href="/password">${svg(IC.key)}Cambia password</a>
    <button role="menuitem" type="button" class="uitem" id="uServer" hidden>${svg(IC.server)}Cambia server</button>
    <button role="menuitem" type="button" class="uitem" id="uDev" hidden>${svg(IC.check)}Da testare<span class="ubadge" id="uDevN" hidden></span></button>
    ${(CFG.menu || []).map((m, i) => `<button role="menuitem" type="button" class="uitem" data-umenu="${i}">${svg(IC[m.icon] || IC.info)}${esc(m.label)}</button>`).join('')}
    <div class="usep"></div>
    <form method="post" action="/logout"><button role="menuitem" type="submit" class="uitem bad">${svg(IC.out)}Esci</button></form>`;
  document.body.appendChild(drop);
  const btn = $('uBtn');
  const theme = () => document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const showTheme = () => { drop.querySelectorAll('#uTheme [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === theme())); $('uThemeRow').setAttribute('aria-checked', String(theme() === 'dark')); };
  const setTheme = t => {
    if (t === 'light') document.documentElement.setAttribute('data-theme', 'light'); else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('theme', t); } catch (e) {}
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'light' ? '#f3f5f8' : '#0d1014';
    showTheme();
    if (H.onTheme) try { H.onTheme(t); } catch (e) {}
  };
  showTheme();
  const place = () => {
    const r = btn.getBoundingClientRect();
    drop.style.top = (r.bottom + 8) + 'px'; drop.style.right = Math.max(8, document.documentElement.clientWidth - r.right) + 'px';
  };
  const close = (focusBtn) => {
    if (drop.hidden) return;
    drop.classList.remove('in'); btn.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
    setTimeout(() => { if (!drop.classList.contains('in')) drop.hidden = true; }, 120);
    if (focusBtn) btn.focus();
  };
  const open = () => {
    place(); drop.hidden = false; requestAnimationFrame(() => drop.classList.add('in'));
    btn.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
  };
  closeUserMenu = close; userMenuOpen = () => !drop.hidden && drop.classList.contains('in');
  $('uDev').onclick = () => { close(); devList(); };
  // voci aggiunte dall'app: SHELL.menu = [{ label, icon, run }]
  drop.querySelectorAll('[data-umenu]').forEach(b => b.onclick = () => { close(); const m = CFG.menu[+b.dataset.umenu]; if (m && m.run) m.run(); });
  btn.onclick = e => { e.stopPropagation(); if (userMenuOpen()) close(); else open(); };
  // chiusura: tocco/clic fuori, ridimensionamento, scorrimento della pagina
  document.addEventListener('pointerdown', e => { if (userMenuOpen() && !e.target.closest('.udrop, #uBtn')) close(); }, true);
  window.addEventListener('resize', () => close());
  window.addEventListener('scroll', () => { if (userMenuOpen()) place(); }, { passive: true });
  // tastiera: frecce tra le voci, Esc chiude (vedi closeTop)
  drop.addEventListener('keydown', e => {
    const items = [...drop.querySelectorAll('#uThemeRow, .uitem:not([hidden])')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  $('uThemeRow').onclick = e => { e.stopPropagation(); setTheme(theme() === 'light' ? 'dark' : 'light'); };
  if (app && app.changeServer) { $('uServer').hidden = false; $('uServer').onclick = () => { close(); app.changeServer(); }; }
  window.setUserMenu = name => {
    if (!name) return; const ini = name.slice(0, 1).toUpperCase();
    $('uAv').textContent = ini; $('uAv2').textContent = ini; $('uName').textContent = name; $('uName2').textContent = name;
  };
})();

// ---------------------------------------------------------------- gesti col dito: scorri a destra/sinistra = cambia sezione, trascina in giù = aggiorna
// Un gesto solo alla volta: la prima direzione decisa (orizzontale o verticale) vince.
function gestures() {
  if (!('ontouchstart' in window)) return;
  document.documentElement.classList.add('ptr-on');           // niente "ricarica" nativo del browser: lo faccio io
  const ICON_PTR = '<span class="ptrw"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"/></svg></span>';
  const ICON_OK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const ICON_X = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const el = document.createElement('div'); el.id = 'ptr'; el.innerHTML = ICON_PTR; document.body.appendChild(el);
  const MAX = 90, GO = 64;
  const view = () => $('view');
  let x0 = null, y0 = null, t0 = 0, mode = null, d = 0, dx = 0, busy = false;
  let pendingCommit = null;   // cambio sezione in corso: un nuovo tocco lo completa subito, così gli swipe rapidi uno dietro l'altro non si perdono
  // pagina "a fianco": la sezione verso cui si sta andando, già disegnata accanto a quella attuale
  let side = null, sideView = null, sideDir = 0;
  const order = () => [...document.querySelectorAll('nav a')].map(a => a.dataset.v);
  const set = (h, anim) => { el.style.transition = anim ? 'transform .2s, opacity .2s' : 'none'; el.style.transform = `translate(-50%, ${h - 50}px) rotate(${h >= GO ? 0 : h * 4}deg)`; el.style.opacity = Math.min(1, h / GO); el.classList.toggle('ready', h >= GO); };
  const W = () => document.documentElement.clientWidth;
  const place = (x, anim) => {
    const v = view(); const tr = anim ? 'transform .2s cubic-bezier(.2,.7,.3,1)' : 'none';
    v.style.transition = tr; v.style.transform = x ? `translateX(${x}px)` : '';
    if (side) { side.style.transition = tr; side.style.transform = `translateX(${x + sideDir * W()}px)`; }
  };
  const fitPages = () => { if (!side) return; const pg = view().parentElement; pg.style.minHeight = Math.max(view().offsetHeight, side.offsetTop + side.offsetHeight) + 'px'; };
  const dropSide = () => { if (side) { side.remove(); side = null; sideView = null; sideDir = 0; } const pg = view().parentElement; if (pg) pg.style.minHeight = ''; };
  const makeSide = (name, dir) => {
    dropSide();
    const v = view(); const pg = v.parentElement;
    // stesso tipo di elemento e stesse classi della sezione vera: spaziature identiche
    side = document.createElement(v.tagName); side.className = (v.className + ' snap').trim(); sideView = name; sideDir = dir;
    // in alto quanto basta perché, a gesto finito, sia già dove la sezione verrà mostrata (al suo scorrimento salvato)
    const top = window.scrollY - (scrollPos[name] || 0);
    side.style.cssText = `position:absolute;left:0;right:0;top:${top}px;margin:0 auto;transform:translateX(${dir * W()}px);transition:none;pointer-events:none`;
    if (viewCache[name]) side.innerHTML = viewCache[name];   // la copia salvata: è quella che si vede scorrere
    pg.appendChild(side); fitPages();
    if (viewCache[name] && (views[name].static || !dirty[name])) return;   // copia buona: niente richieste durante il gesto
    Promise.resolve().then(() => views[name](0)).then(html => { if (typeof html === 'string') { if (!views[name].static) { viewCache[name] = html; dirty[name] = false; } if (side && sideView === name) { side.innerHTML = html; fitPages(); } } })   // copia mancante o vecchia: la prendo ora
      .catch(e => { if (side && sideView === name && !viewCache[name]) side.innerHTML = `<div class="panel empty">${esc(e.message)}</div>`; });
  };
  window.addEventListener('touchstart', e => {
    x0 = null;
    if (pendingCommit) pendingCommit();
    if (busy || e.touches.length !== 1 || anyModal()) return;
    const tch = e.touches[0];
    if (tch.target.closest('.udrop, .umenu')) return;   // tocco dentro il menu utente: è un clic sulle voci, non un gesto
    if (tch.target.closest('nav, input[type=range], .xscroll, .xsel-pop')) return;   // barra delle sezioni, cursori e liste che scorrono di lato: tutto il resto si swipa (anche campi di testo e tendine)
    x0 = tch.clientX; y0 = tch.clientY; t0 = Date.now(); mode = null; d = 0; dx = 0;
  }, { passive: true });
  window.addEventListener('touchmove', e => {
    if (x0 == null) return;
    const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
    if (!mode) {
      // direzione non ancora decisa: a pagina in cima e dito verso il basso il browser non deve tirare la pagina (effetto "stretch" di Android)
      if (my > 0 && window.scrollY <= 0 && e.cancelable) e.preventDefault();
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;   // decido la direzione dopo pochi pixel: lo swipe risponde subito
      // o verticale o orizzontale, mai in diagonale: vince la direzione più "forte" (orizzontale solo se nettamente tale)
      if (Math.abs(mx) > Math.abs(my) * 1.3) {
        // orizzontale: non dal bordo estremo (lì resta il gesto "indietro" del telefono)
        const w = W(); mode = (x0 > w * 0.1 && x0 < w * 0.9) ? 'swipe' : 'none';
      } else mode = (my > 0 && window.scrollY <= 0 && Math.abs(my) > Math.abs(mx) * 1.3) ? 'pull' : 'none';
    }
    if (mode === 'pull') {
      if (my <= 0 || window.scrollY > 0) { if (d) set(0, true); d = 0; return; }
      if (e.cancelable) e.preventDefault();   // la bolla è la mia: niente stretch del browser
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
      // rilasciato oltre la soglia: la bolla si ferma, gira almeno 0,6 s, mostra ✓ per 0,5 s e poi se ne va
      busy = true; el.classList.add('spin'); set(GO, true);
      (async () => {
        const t0 = Date.now(); let err = null;
        Object.keys(viewCache).forEach(v => { if (v !== S.view) dirty[v] = true; });
        try { if (H.onPull) await H.onPull(); await H.load(); await render(); } catch (e) { err = e; }
        setTimeout(prefetchDirty, 300);
        await new Promise(r => setTimeout(r, Math.max(0, 600 - (Date.now() - t0))));
        el.classList.remove('spin');
        el.innerHTML = err ? ICON_X : ICON_OK; el.classList.add(err ? 'err' : 'done');
        if (err) toast(err.message, true);
        await new Promise(r => setTimeout(r, 500));
        set(0, true); busy = false; d = 0;
        setTimeout(() => { el.classList.remove('done', 'err'); el.innerHTML = ICON_PTR; }, 250);
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
        scrollPos[S.view] = window.scrollY;
        viewCache[S.view] = v.innerHTML;   // la sezione che lascio, così com'è (gruppi aperti…)
        S.view = name; ++renderGen;
        v.style.transition = 'none'; v.style.transform = '';
        v.innerHTML = done.innerHTML;
        dropSide();
        try { if (views[name].after) views[name].after(); } catch (e) { console.error(e); }
        viewCache[name] = v.innerHTML;
        window.scrollTo(0, scrollPos[name] || 0);
        if (location.hash === '#' + name) navigate();
        else { skipNextRender = true; swipeHash = true; location.replace('#' + name); setTimeout(() => { skipNextRender = false; swipeHash = false; }, 300); }   // replace: lo swipe non lascia tracce nella cronologia
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
  const editing = () => { const a = document.activeElement; return anyModal() || (a && a.closest && a.closest('#view') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); };
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (editing()) { pending = true; return; }   // non interrompo chi sta scrivendo: aggiorno dopo
      pending = false;
      Object.keys(viewCache).forEach(v => { if (v !== S.view) dirty[v] = true; });
      try { await H.load(); await render(); } catch (e) {}
      setTimeout(prefetchDirty, 300);
    }, 200);
  };
  function connect() {
    if (es) { try { es.close(); } catch (e) {} }
    es = new EventSource(CFG.events);   // flusso degli avvisi (SCalendar lo ha su /api/live: /api/events sono i suoi eventi)
    es.onopen = () => { setLive(true); retry = 1000; if (H.onOnline) try { H.onOnline(); } catch (x) {} };
    es.addEventListener('version', e => { if (window.__srvVer && window.__srvVer !== e.data) { toast(CFG.name + ' aggiornato: ricarico…'); setTimeout(() => location.reload(), 600); return; } window.__srvVer = e.data; });
    es.addEventListener('hello', e => { if (last !== null && last !== e.data) refresh(); last = e.data; });   // tornato online: qualcosa può essere cambiato
    es.addEventListener('changed', e => { last = e.data; refresh(); });
    // avvisi propri dell'app (es. SNotes: nota cambiata, cursori degli altri): Shell.start({ sse: { nome: fn(dati) } })
    Object.entries(H.sse || {}).forEach(([k, fn]) => es.addEventListener(k, e => { try { fn(e.data); } catch (x) { console.error(x); } }));
    es.onerror = () => { setLive(false); try { es.close(); } catch (e) {} es = null; setTimeout(connect, retry); retry = Math.min(retry * 2, 10000); };
  }
  connect();
  // controllo della versione anche senza il collegamento dal vivo: al rientro nell'app (Android a volte non avvisa la pagina)
  // e ogni minuto. Server aggiornato → la pagina si ricarica da sola.
  let lastCheck = 0;
  const checkVersion = async () => {
    if (Date.now() - lastCheck < 5000) return; lastCheck = Date.now();
    try { const v = (await (await fetch('/api/version', { cache: 'no-store', credentials: 'same-origin' })).json()).version;
      if (v && window.__srvVer && v !== window.__srvVer) { toast(CFG.name + ' aggiornato: ricarico…'); setTimeout(() => location.reload(), 600); }
      else if (v && !window.__srvVer) window.__srvVer = v;
    } catch (e) {}
  };
  setInterval(() => { if (!document.hidden) checkVersion(); }, 60000);
  window.addEventListener('focus', checkVersion);
  window.addEventListener('pageshow', checkVersion);
  window.appResumed = () => { checkVersion(); retry = 1000; if (!es) connect(); };   // chiamabile dall'app Android al rientro
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkVersion(); retry = 1000; if (!es) connect(); else refresh(); if (H.onVisible) try { H.onVisible(); } catch (e) {} } });
  // finita la modifica (modale chiusa / campo lasciato): se nel frattempo è cambiato qualcosa, ridisegno
  document.addEventListener('focusout', () => { if (pending) refresh(); });
  const mo = new MutationObserver(() => { if (pending && !anyModal()) refresh(); });
  mo.observe($('modal'), { attributes: true, attributeFilter: ['class'] });
}

// ---------------------------------------------------------------- avvio
/** Con SHELL.bare: solo load → menu utente (setUserMenu), afterLoad, pulsante "Aggiorna app", voci sviluppatore.
 *  cfg: { load: async () => {…dati di base…}, currency: () => '€', onForm(form, fields, vals), onNavigate(view),
 *         onPull: async () => {…}, onVisible: () => {…}, afterLoad: () => {…}, onTheme(t), fab: () => {…},
 *         modalOpen: () => bool (finestre proprie dell'app aperte: niente gesti né ridisegni) } */
async function start(cfg) {
  Object.assign(H, cfg || {});
  if (!H.load) H.load = async () => { S.settings = await get('/api/settings'); };
  const fab = $('fab'); if (fab && H.fab) { fab.onclick = H.fab; tapFast(fab); }
  try { await H.load(); if (S.settings && S.settings.username && window.setUserMenu) setUserMenu(S.settings.username); setLive(true); }
  catch (e) { const v = $('view'); if (v) v.innerHTML = `<div class="panel empty">${esc(e.message)}</div>`; else toast(e.message, true); return; }
  if (H.afterLoad) try { H.afterLoad(); } catch (e) { console.error(e); }
  if (CFG.bare) { document.documentElement.classList.add('bare'); appUpdateInfo().then(showAppUpdBtn); devSetup(); return; }
  navigate();
  gestures();
  if (CFG.live !== false) live();   // app che fanno da sole (es. SMonitor, che interroga il server a intervalli): niente SSE
  appUpdateInfo().then(showAppUpdBtn);
  devSetup();
  // sezioni pronte di lato per lo swipe: le preparo in sottofondo
  if ('ontouchstart' in window) setTimeout(() => { [...document.querySelectorAll('nav a')].map(a => a.dataset.v).filter(v => v !== S.view).forEach(v => Promise.resolve().then(() => views[v](0)).then(h => { if (typeof h === 'string' && !viewCache[v]) viewCache[v] = h; }).catch(() => {})); }, 1500);
}

/**
 * Tavolozza comune: 6 colori pastello (+ nessuno). La classe pal-<chiave> dà fondo, bordo e colore degli elementi sopra
 * (shell.css). Palette.open(tasto, scelto, scelta => …) apre la scelta sopra al tasto (sotto se non c'è posto).
 */
const Palette = {
  colors: [['', 'Nessuno'], ['yellow', 'Giallo'], ['orange', 'Pesca'], ['pink', 'Rosa'], ['purple', 'Lavanda'], ['blue', 'Azzurro'], ['green', 'Menta']],
  cls: k => 'pal-' + (k || 'none'),
  close() { const p = document.getElementById('palPop'); if (p) { p.remove(); return true; } return false; },
  open(anchor, current, onPick) {
    if (Palette.close()) return;   // secondo tocco sullo stesso tasto: chiude
    const pop = document.createElement('div'); pop.id = 'palPop'; pop.className = 'palpop';
    pop.innerHTML = Palette.colors.map(([k, l]) => `<button type="button" class="palsw ${Palette.cls(k)} ${(current || '') === k ? 'on' : ''}" data-c="${k}" title="${esc(l)}" aria-label="${esc(l)}"></button>`).join('');
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)) + 'px';
    pop.style.top = (r.top - h - 8 >= 8 ? r.top - h - 8 : Math.min(r.bottom + 8, innerHeight - h - 8)) + 'px';
    const off = ev => { if (!pop.contains(ev.target) && !anchor.contains(ev.target)) done(); };
    const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); done(); } };
    const done = () => { pop.remove(); document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', key, true); removeEventListener('scroll', done, true); };
    pop.querySelectorAll('.palsw').forEach(b => b.onclick = ev => { ev.stopPropagation(); done(); onPick(b.dataset.c); });
    setTimeout(() => { document.addEventListener('pointerdown', off, true); document.addEventListener('keydown', key, true); addEventListener('scroll', done, { capture: true, passive: true }); });
  },
};
Object.assign(window, { Palette, $, esc, css, app, S, api, get, setLive, toast, copyText, otherApps, openModal, closeModal, closeTop, backdropClose, choose, confirmDel, formModal, COLORS, tapAndHold, tapFast, views, viewCache, navigate, render, appVersion, verGt, appUpdateInfo });
window.Shell = { cfg: CFG, start, version: '0.9.0' };
})();
