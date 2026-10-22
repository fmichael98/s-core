# s-core

Guscio comune delle app S* (SMoney, SHealth, SCalendar, SMonitor): quello che prima era copiato in ogni app sta qui, una volta sola.

**Tappa 1 (questa):** parte web — barra in alto con sezioni a pillola, menu utente (tema, password, server, esci),
gesti (trascina in giù = aggiorna, swipe = cambia sezione, + pronto), finestre (modale, scelta, form), avvisi,
aggiornamento dal vivo (SSE con riconnessione), ricarica automatica quando il server cambia versione, pulsante "Aggiorna app".

## Uso in un'app

`Cargo.toml`:
```toml
s-core = { git = "https://github.com/fmichael98/s-core", tag = "v0.1.0" }
```
Router: `.merge(s_core::routes())` (rotte pubbliche `/shell.js`, `/shell.css`).

`index.html` (prima di app.css / app.js):
```html
<link rel="stylesheet" href="/shell.css?v=0.1.0">
<link rel="stylesheet" href="/app.css">
<script>window.SHELL = { name: 'SHealth', csrf: 'X-SHealth', ua: 'SHealthApp', noFab: ['stats','settings'] };</script>
<script src="/shell.js?v=0.1.0"></script>
<script src="/app.js"></script>
```
`app.css` imposta solo l'accento e gli stili propri: `:root{--acc:#f82e41;--acc-ink:#fff}`.

`app.js`: definisce le sezioni in `views` e chiama
```js
Shell.start({ load: async () => { S.settings = await get('/api/settings'); }, fab: () => …, currency: () => '€' });
```
Globali disponibili: `$ esc css app S api get setLive toast openModal closeModal choose confirmDel formModal COLORS tapAndHold tapFast views viewCache navigate render`.

Campo con suggerimenti: `Combo.attach(input, [{v, t, color, sub}], { value, allowEmpty, onPick(item, how), onCancel })` — scrivendo filtra e completa, ↑/↓ scelgono, Invio/Tab confermano (`how` dice quale tasto, con `Shift` davanti se premuto), Esc annulla.

Tavolozza comune (colori di note, schede…): 6 pastello + nessuno, `Palette.colors`. La classe `Palette.cls(chiave)` (`pal-yellow`…) dà `--pal-bg` (fondo), `--pal-line` (bordo), `--pal-acc` (elementi sopra: caselle, icone) e `--pal-ink` (segno sopra `--pal-acc`), giusti in tema chiaro e scuro. `Palette.open(tasto, scelto, k => …)` apre la scelta.

Ganci di `Shell.start`: `load` (dati di base, usato anche da trascinamento e aggiornamento dal vivo), `fab`, `currency`, `onForm(form, fields, vals)`, `onNavigate(view)`, `onPull`, `onVisible`, `afterLoad`, `onTheme(t)`.
`window.SHELL`: `name`, `csrf` (intestazione anti-CSRF), `ua` (prefisso dello user-agent dell'app Android), `home`, `fab` (sezioni col +) oppure `noFab`, `aliases` (`{accounts:'home'}`), `live:false` (niente SSE), `theme` (`{ label(), cycle() }`: il tema lo gestisce l'app, la voce del menu chiama `cycle` e mostra `label`), `menu` (voci in più nel menu utente `[{label, icon, run}]`).

App a pagina unica (es. SMap, mappa a tutto schermo): `window.SHELL = { name:'SMap', csrf:'X-SMap', bare:true }`. Con `bare` il guscio non gestisce sezioni (`#view`, `nav`, `#sezione`), gesti né SSE: `Shell.start({ load, afterLoad, onTheme })` carica i dati, riempie il menu utente, mostra "Aggiorna app" e le voci sviluppatore. Servono solo `.top header` con `.brand` e `.umenu`, `#modal/#modalBox`, `#toast`; `html.bare` toglie lo spazio in fondo alla pagina.

## Rilascio
Alza `version` in Cargo.toml, commit, tag `vX.Y.Z`, push. Le app scelgono quando passare al tag nuovo.
