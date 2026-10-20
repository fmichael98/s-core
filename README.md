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

Ganci di `Shell.start`: `load` (dati di base, usato anche da trascinamento e aggiornamento dal vivo), `fab`, `currency`, `onForm(form, fields, vals)`, `onNavigate(view)`, `onPull`, `onVisible`, `afterLoad`, `onTheme(t)`.
`window.SHELL`: `name`, `csrf` (intestazione anti-CSRF), `ua` (prefisso dello user-agent dell'app Android), `home`, `fab` (sezioni col +) oppure `noFab`, `aliases` (`{accounts:'home'}`).

## Rilascio
Alza `version` in Cargo.toml, commit, tag `vX.Y.Z`, push. Le app scelgono quando passare al tag nuovo.
