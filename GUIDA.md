# Guida della famiglia S

Le caratteristiche comuni delle app (STurni, SGarage, SCalendar e le prossime), con le regole da seguire. Il codice
di riferimento è SApp, l'app di esempio di questo repository: ogni punto dice dove sta.

Si **copia**, non si dipende: un'app prende il pezzo, lo adatta, e da lì è suo. Quando un'app migliora un pezzo
comune (es. l'isola più piccola), il miglioramento si riporta qui.

---

## 1. Principi

- **Per casa, su un server Ubuntu**: un solo programma (Rust) con dentro pagine, icone e novità; un database SQLite;
  Caddy davanti per l'HTTPS da fuori. Niente servizi esterni obbligatori.
- **Tutto in italiano**: pagine, messaggi d'errore, commenti nel codice, nomi delle prove (`fn utenti_e_nomi_doppi`).
  Messaggi d'errore che dicono cosa fare («Il nome utente «anna» esiste già.»), non codici.
- **Due ruoli**: l'**amministratore** gestisce solo utenti, configurazione e aggiornamenti (pagina `/admin`), non usa
  l'app; gli **utenti** usano l'app. Il server lo fa rispettare (vedi §3.3), non solo la pagina.
- **Si aggiorna dalla pagina**: lo zip della release si carica dal pannello; copia del database prima, e se la
  versione nuova non parte torna da sola alla precedente.
- **Dal telefono come un'app**: web app installabile, e un'app Android quando serve qualcosa che il browser non fa.
- **Prove**: ogni regola del dominio e ogni caso d'uso ha la sua prova; le Actions non pubblicano se una prova fallisce.

## 2. Repository

| Cartella | Cosa |
|---|---|
| `crates/` | server Rust, un crate per strato (§3) |
| `frontend/` | pagina React (§4), compilata in `frontend/dist` e incorporata nel programma |
| `packaging/` | install.sh, aggiornatore, Caddy, systemd, config d'esempio (§6) |
| `android/` | app Android, se c'è (§5) |
| `.github/workflows/release.yml` | compila, prova, impacchetta, pubblica (§7) |
| `CHANGELOG.md` | novità per versione (nel programma: `/api/changelog`) |
| `INSTALLAZIONE.md`, `README.md` | per chi installa e per chi sviluppa |
| `rustfmt.toml` | righe da 160 |

## 3. Server

### 3.1 Architettura esagonale, un crate per strato
Le dipendenze vanno solo verso l'interno: `domain ← app ← sqlite · system · http ← server`.

| Crate | Cosa | Regole |
|---|---|---|
| `domain` | regole pure: tipi validi per costruzione (`Username::parse`, `Password`…), date, testi | niente database, rete, file, serde; ogni modulo con i suoi test |
| `app` | casi d'uso (metodi di `App`) + **porte** (`ports.rs`: i trait di ciò che serve da fuori) | sincrono; tutto in una transazione (`tx(db, \|r\| …)`); orologio dalla porta `Clock` |
| `sqlite` | adattatore dei dati (implementa i `…Repo`) | vedi §3.2 |
| `system` | adattatore della macchina: password (argon2), orologio, file di configurazione, aggiornamenti, APK | |
| `http` | adattatore web (axum): rotte → casi d'uso → JSON (`view.rs`) | nessuna regola qui; i casi d'uso girano in `run()` (`spawn_blocking`) |
| `server` | il programma: collega gli adattatori, comandi di servizio, lavori periodici | |

Altri adattatori sono crate in più accanto (servizi esterni, archivio file, notifiche: §8).
Nomi: `<app>-domain`, `<app>-app`…; il programma si chiama col nome breve (`sgarage`, `scalendario`).
Rust edition 2024, `unsafe` vietato, clippy con `-D warnings`.

### 3.2 Database (SQLite)
- Un file (`/var/lib/<app>/<app>.db`), modalità WAL, una connessione con lucchetto (per una famiglia basta).
- **Migrazioni**: un elenco di script SQL in `schema.rs`, applicati una volta (`PRAGMA user_version`). Uno script
  pubblicato non si cambia mai: per cambiare lo schema se ne aggiunge uno in fondo.
- Tabelle `STRICT`, chiavi esterne con `ON DELETE CASCADE` (eliminare un utente porta via i suoi dati).
- **Segno dell'app** (`PRAGMA application_id`, quattro lettere): il database di un'altra app non si apre per sbaglio.
- **Copia senza segreti**: `backup_to` (`VACUUM INTO`) toglie sessioni e codici dalla copia scaricabile.
- Utenti, sessioni (anche dei telefoni: colonna `device`) e impostazioni sono comuni (migrazione 1).

### 3.3 Accesso e sicurezza (`app/accounts.rs`, `http/auth.rs`, `system/security.rs`)
- Password con **argon2**; regole in `domain/user.rs`. Primo amministratore dal config (`password_hash`, fatto con
  `<app> hash-password`), poi gli utenti stanno nel database. Utente nuovo: password = nome utente, da cambiare al
  primo accesso (`must_change` → pagina `/password`).
- **Sessione**: gettone casuale nel cookie `<app>_session` (`HttpOnly; SameSite=Lax`, `Secure` in HTTPS); nel
  database solo la sua impronta SHA-256. Durata `session_days`; «ultima volta visto» aggiornato ogni 5 minuti.
- **Anti-CSRF**: ogni richiesta che modifica, col cookie, deve avere l'intestazione `x-<app>` (la mette `lib/api.ts`).
- **Freno ai tentativi**: `max_fails` sbagli per indirizzo → blocco di `lock_minutes`. Per un nome che non esiste si
  verifica comunque una password finta: dai tempi non si capisce quali nomi ci sono.
- **Ruoli nel cancello** (`gate`): `/admin`, `/api/admin/*`, `/api/update/*` solo all'amministratore; tutto il resto
  solo agli utenti. Pubbliche: `/login`, `/api/version`, `/api/changelog`, `/api/device/login`, `/api/app`, l'APK,
  pagine e icone.
- **Telefoni** (app Android): `POST /api/device/login` → gettone che dura finché lo si usa (365 giorni dall'ultimo uso),
  mandato come `Authorization: Bearer …` (niente anti-CSRF: non c'è cookie). Lo stesso gettone, messo come cookie
  nella WebView, apre la pagina. Elenco e «scollega» in Impostazioni (`/api/devices`).

### 3.4 Configurazione (`app/config.rs`, `system/config_file.rs`)
`/etc/<app>/config.toml`: `bind` (porta di casa), `public_host`/`public_port` (HTTPS da fuori con Caddy),
`session_days`, `max_fails`, `lock_minutes`, `database`, `username`, `password_hash`. Si modifica dal pannello
(Configurazione, con la password di chi salva); vale dopo il riavvio, che il pannello fa da solo.

### 3.5 Aggiornamenti (`system/update.rs`, `packaging/apply-update.sh`)
1. Il pannello carica lo zip (`/api/update/upload`, fino a 120 MB); il programma lo controlla (versione, contenuto,
   firma se attiva) e lo prepara in `/var/lib/<app>/update`.
2. «Installa» scrive la richiesta; un'unità systemd `.path` la vede e lancia `apply-update.sh` come root.
3. L'aggiornatore estrae, (ri)controlla la firma, lancia `install.sh` (copia del database, programma nuovo, riavvio,
   verifica su `/api/version`; se non risponde rimette il programma di prima) e scrive l'esito.
4. La pagina aspetta il riavvio (`waitForServerRestarts`) e mostra le novità (`/api/changelog?after=…`).
- `.helper` dice la versione dell'aggiornatore installato (il programma la controlla).
- **Firma** (facoltativa): con `packaging/firma.pub` nel repository il programma accetta solo zip con `SHA256SUMS`
  firmato (ed25519) dal segreto delle Actions.

### 3.6 Aggiornamento dal vivo (`http/live.rs`, `hooks/use-live.ts`)
`/api/live` (SSE): dopo ogni modifica riuscita (POST/PUT/DELETE) tutte le pagine aperte rileggono. Se cambia la
versione del server (`boot`), le pagine si ricaricano da sole.

### 3.7 Altro di comune
- `/api/version` → `{ app: "<nome breve>", version, boot, https }`: install.sh e l'app Android controllano `app`.
- Novità: `CHANGELOG.md` incorporato (`include_str!`), `## versione` + voci `- …`.
- Comandi: `<app> --version`, `hash-password`, `check-config FILE`, `verify-package ZIP`, `reset-password UTENTE`.
- Lavori periodici in `server`: ogni ora via le sessioni scadute (l'app aggiunge le sue pulizie).
- Fuso orario: il servizio gira con `TZ=Europe/Rome` (date e scadenze sull'ora di qui anche se il server è in UTC).

## 4. Pagina web

### 4.1 Base
React 19 + Vite + Tailwind v4 + **shadcn/ui** (`components/ui`, stile new-york, icone Lucide, carattere Geist).
Quattro pagine (`index.html`, `login.html`, `password.html`, `admin.html`), ognuna col suo `main.tsx`.
Tema scuro di partenza (colore di sfondo `#0a0a0a`), chiaro dal menu utente; scelto prima del primo disegno
(script nel `<head>`: niente lampo bianco).

### 4.2 Colore dell'app
Grigi neutri di shadcn e **un colore principale** per app (`--primary`, `--ring` in `index.css`, chiaro e scuro):
il nome è «S» bianco + il resto nel colore (`Brand`). Stati comuni: `--ok`, `--warn`, `--info`, `--destructive`.
Icone: glifo Lucide bianco su quadrato del colore (`tools/icone.py`).

### 4.3 Struttura della pagina principale (`app/App.tsx`, `app/home.tsx`)
- Radice `fixed inset-0 flex flex-col` (non `h-svh`: nella WebView dell'app Android le unità dello schermo non sono
  affidabili). Il contenuto scorre in `main` (`overflow-y-auto`).
- **In alto**: sul telefono il titolo della sezione, grande (26 px, extrabold); da PC `Brand` a sinistra e le sezioni
  in alto (ToggleGroup) con «+ Nuovo». A destra: stato della rete (`OfflineBadge`), «Installa», menu utente.
- **Isola** (`components/island.tsx`, telefono): pastiglia di 58 px, 1,25rem sopra il fondo, con le sezioni e il
  **+** tondo in mezzo (azione, non pagina); il contenuto sfuma verso il fondo e lascia spazio sotto
  (`pb-[calc(6.5rem+env(safe-area-inset-bottom))]`). Risponde al rilascio del dito, non al click (il telefono il click
  non lo manda se il tocco ferma il contenuto che scorre ancora), e i gesti della pagina non partono da lì.
- **Gesti** (`components/gestures.tsx`): scorri a destra/sinistra = sezione accanto, trascina in giù = aggiorna,
  solo se l'area che scorre (trovata da sola, anche `main`) era in cima quando si appoggia il dito.
- Sezione nell'indirizzo (`#/elenco`): Indietro e preferiti funzionano. Scorciatoie della web app nel manifest
  (`/#nuovo`, `/#settings`).
- **Impostazioni** in un pannello laterale (Sheet) aperto dal menu utente; schede (Card): Account, quelle dell'app,
  App Android, Web app.

### 4.3.1 Telefoni stretti
La pagina non deve mai uscire dallo schermo, anche a **360 e 320 px** di larghezza e col testo del telefono grande:
- una griglia senza `grid-cols-*` ha una colonna `minmax(0, 1fr)` (regola in `index.css`): si restringe, non si
  allarga col contenuto; in una riga flessibile il pezzo che può accorciarsi ha `min-w-0` (e `truncate` se serve);
- niente larghezze fisse prese da una misura: un grafico SVG largo quanto il riquadro misurato ha `max-w-full`
  (altrimenti tiene il riquadro largo com'era e non si restringe più);
- pulsanti affiancati (periodi, schede) con `flex-1 min-w-0 overflow-hidden`; tabelle con celle più strette sotto i
  640 px;
- prima di consegnare: `python3 tools/schermi.py http://127.0.0.1:PORTA utente password "#/sezione" …` (con
  l'app avviata): dice cosa esce dallo schermo a 360 e 320 px, anche col testo grande, e salva le immagini.

### 4.4 Menu utente (`components/user-menu.tsx`)
Avatar (da PC anche il nome; `image` e `initials` per l'avatar) → voci dell'app (`entries`), poi Tema, Cambia
password, le voci `end`, Esci. Ogni voce (`MenuEntry`): `label`, `icon`, `onSelect` o `href`, e:
- `alert`: da fare (es. «Aggiorna app 2.2»): in evidenza, col **pallino** arancio anche sull'avatar
- `badge`: cose che aspettano l'utente (es. richieste): numero rosso sulla voce, sommato sull'avatar
- `count`: numero da guardare ma non urgente (es. «Da testare»): solo sulla voce
- `group`: linea sopra (nuovo gruppo, es. le voci del responsabile); `end`: in fondo, dopo tema e password
Nell'app Android «Esci» esce dall'app (non solo dalla pagina).

### 4.5 Installare (`components/install-app.tsx`, `lib/pwa.ts`, `lib/phone.ts`)
«Installa» apre la **scelta**: App Android (se il server ha l'APK; «consigliata» su Android) o Web app (prompt del
browser, o istruzioni passo per passo dove il prompt non c'è: iPhone, Firefox…). Sul telefono il pulsante sta nel menu
utente («Installa l'app»). L'APK si scarica anche senza essere entrati.

### 4.6 Pezzi comuni
| Pezzo | A cosa serve |
|---|---|
| `lib/api.ts` | `get`/`api` con anti-CSRF, sessione scaduta → accesso, server che riparte, stato della rete, copie per l'offline |
| `lib/boot.tsx` | avvio di una pagina: tema, tasto Indietro, web app, notifiche (sonner), tooltip, errori, niente zoom |
| `lib/overlays.ts` | Indietro del telefono chiude finestre e menu; l'aggiornamento dal vivo aspetta che si chiudano; sblocca la pagina se Radix lascia `pointer-events: none` sul body |
| `lib/phone.ts` | ponte con l'app Android (`window.<App>App`), versione dell'APK, «Aggiorna app» |
| `lib/palette.ts`, `palette-picker` | colori degli avatar e degli oggetti |
| `components/leave-guard.tsx` | «Hai modifiche non salvate» prima di chiudere un pannello o uscire |
| `components/offline-bar.tsx`, `live-dot.tsx` | stato del collegamento col server |
| `components/auth-card.tsx`, `password-input.tsx` | accesso e cambio password |
| `components/date-picker.tsx`, `time-picker.tsx`, `number-stepper.tsx` | campi data, ora, numero (italiano, settimana da lunedì) |
| `components/tip.tsx`, `error-boundary.tsx`, `user-avatar.tsx` | suggerimenti, errori della pagina, avatar |
| `hooks/use-async`, `use-refresh`, `use-live`, `use-media`, `use-theme`, `use-install`, `use-fit-height` | dati, aggiornamenti, media query, tema, installazione |
| `admin/*` | pannello dell'amministratore: utenti, configurazione, aggiornamenti, sistema |

### 4.7 Web app (PWA)
`public/manifest.json` (scorciatoie, icone anche *maskable*), `public/sw.js`: pagine dalla rete con copia di riserva,
dati `/api/*` dalla rete con l'ultima copia se il server non risponde (solo da consultare), APK mai in cache;
`offline.html` quando non c'è niente. Senza server per qualche secondo, accanto al nome compare «offline»
(`OfflineBadge`) con «Riprova adesso».

Un'app può scegliere di **non** tenere copie (STurni: dati condivisi tra colleghi, meglio niente che vecchi): il
service worker tiene solo script, stili e la pagina «non raggiungibile» (col suo logo), e la pagina non ha la parte
delle copie in `lib/api.ts` (vedi STurni 2.77).

### 4.8 Scrittura
Testi brevi e diretti, in italiano, con le virgolette «». Etichette di una o due parole; spiegazioni nel
`CardDescription` o sotto i campi. Esempi nei campi inventati (mai dati veri). Niente pulsanti «Aggiungi» doppi: il
+ è quello dell'isola (o «+ Nuovo» da PC).

## 5. App Android (facoltativa)
Quando serve qualcosa che il browser non fa (es. sveglie, widget), o come scelta in più accanto alla web app.
Riferimenti: **SCalendar** (`android/`: sveglie, widget, sincronizzazione) e **SHealth** (`android/`: solo la pagina,
con i file da allegare scelti col selettore di Android, i PDF aperti col telefono e i download in Download).
- Kotlin + Jetpack Compose, minSdk 26, compilata solo dalle Actions (§7); stessa chiave di firma per sempre (in
  `android/signing/`), così ogni versione si installa sopra la precedente.
- Accesso col telefono (`/api/device/login`, nome del telefono) → gettone salvato; la pagina dell'app gira in una
  **WebView** col gettone come cookie (LayoutParams `MATCH_PARENT`, altrimenti la pagina si taglia).
- **Ponte** `window.<App>App` (`lib/phone.ts`): `openPhone()` apre la schermata nativa (in SCalendar `openAlarms`),
  `logout()`, `version()`, `updateApp()`.
- **Indietro**: prima chiede alla pagina (`window.appBack()`, da `lib/overlays.ts`: chiude il pannello o la finestra
  aperti), poi la cronologia della WebView, e sulla prima vista l'app va in secondo piano (`moveTaskToBack`), non si
  chiude.
- **Aggiornamento**: l'APK arriva dentro lo zip del server (`SApp X.Y.apk`); quando il server ne ha uno più nuovo, la
  pagina mostra «Aggiorna app» nel menu utente (pallino sull'avatar) e l'app lo scarica e apre l'installazione.
- User-Agent `<App>App/X.Y` (WebView) e `<App>-Android/X.Y` (chiamate dell'app): il server li mostra tra i telefoni.

## 6. Pacchetto e installazione (`packaging/`)
| File | Cosa |
|---|---|
| `install.sh` | utente di sistema, cartelle, config (chiede la password di admin la prima volta, aggiunge le chiavi nuove), copia del database (ultime 10), programma, APK, servizi, Caddy, avvio e verifica; se non risponde rimette il programma di prima |
| `apply-update.sh` | l'aggiornatore (root), lanciato da `<app>-update.path` |
| `caddy-sync.sh` | scrive `/etc/caddy/conf.d/<app>.caddy` dalla configurazione e ricarica Caddy |
| `<app>.service` | servizio con protezioni systemd (`ProtectSystem=strict`…) e `TZ=Europe/Rome` |
| `config.example.toml`, `LEGGIMI.md` | config d'esempio, istruzioni nel pacchetto |

Nel pacchetto `<repo>-vX.Y.Z/`: programma, file di `packaging/`, eventuale APK. `install.sh` funziona sia a mano
(`sudo ./install.sh`) sia dall'aggiornatore (`<APP>_UNATTENDED=1`).

## 7. Rilascio (`.github/workflows/release.yml`)
- Su ogni pull request: app Android (se c'è), pagina, `cargo fmt --check`, clippy `-D warnings`, prove, programma,
  pacchetto controllato con `verify-package`. Niente pubblicazione.
- Su `main`: lo stesso, poi la release `vX.Y.Z` con lo zip (e l'APK). Una versione si pubblica una volta: per una
  nuova si alza `version` in `Cargo.toml` (e si scrive la voce in `CHANGELOG.md`).
- Si lavora su un ramo, pull request, Actions verdi, merge su `main`, si controlla che la release sia uscita.

## 8. Pezzi facoltativi (da copiare dall'app che li ha)
| Pezzo | Dove | Cosa |
|---|---|---|
| Notifiche Web Push | SGarage `crates/push`, `frontend/src/lib/push.ts` | avvisi al telefono/PC anche a pagina chiusa (VAPID, RFC 8291/8292) |
| Archivio file | SGarage `crates/files` | file caricati su disco, nominati con l'impronta del contenuto |
| Collegamento tra app | STurni/SGarage `…/scalendar.rs` (chi dà) e SCalendar `crates/links` (chi legge) | codice personale `id.segreto` creato nell'app che dà, `GET /api/ext/…` con `Authorization: Bearer` |
| App Android | SCalendar `android/` (sveglie, widget), SHealth `android/` (solo la pagina) | §5 |
| Servizio esterno | SGarage `crates/openapi` | esempio di adattatore verso un servizio a pagamento, facoltativo |

## 9. Differenze note tra le app
Quello che un'app fa diversamente da qui, apposta o in attesa di essere allineato:

| App | Cosa | Perché / quando |
|---|---|---|
| STurni | server in un crate solo, diviso in moduli (`server/src/{domain,app,adapters}`) | da dividere in crate più avanti, come lavoro a parte |
| STurni | niente isola: navigazione sua (mese in basso, pannelli dal menu utente) | voluto: è una griglia di turni |
| STurni | niente copie offline di pagine e dati | voluto (§4.7) |
| STurni | web app installabile solo da telefono («Installa» non c'è da PC) | voluto |
| STurni, SGarage | aggiornamento dal vivo su `/api/events` (qui `/api/live`) | solo il nome |
| SCalendar | `/api/version` risponde `s-calendario` (le altre il nome breve) | da sistemare insieme all'app Android, che lo controlla |
| SCalendar | ponte Android `openAlarms()` (qui `openPhone()`) | nome storico |

## 10. Porte e colori
| App | Repository | Nome breve | Casa | Da fuori | Colore |
|---|---|---|---|---|---|
| STurni | s-turni | sturni | 8099 | 17443 | verde acqua `oklch(0.56 0.095 206)` |
| SGarage | s-garage | sgarage | 8101 | 18443 | lime `#A3E635` |
| SCalendar | s-calendario | scalendario | 8097 | 13443 | viola `#8D50E9` |
| SHealth | s-salute | shealth | 8098 | 14443 | rosso `#F82E41` |
| SApp (esempio) | s-core | sapp | 8090 | 19443 | blu `#2563EB` |

Una porta nuova per ogni app (casa e da fuori), da aggiungere qui; sul router si inoltra quella da fuori.

## 11. Nuova app
1. `python3 tools/nuova-app.py ../s-xyz sxyz SXyz PORTA_CASA PORTA_FUORI` (nomi, porte, segno del database).
2. Colore (`index.css`) e icone (`tools/icone.py "#RRGGBB" glifo frontend/public`); `manifest.json`.
3. Dominio: tipi e regole in `domain`, porte e casi d'uso in `app`, tabelle (migrazione 2) e repo in `sqlite`, rotte
   in `http` (un modulo per argomento) e viste in `view.rs`; prove a ogni strato.
4. Pagina: sezioni in `app/home.tsx` (isola e gesti), tipi in `lib/types.ts`, schede in Impostazioni.
5. Repository su GitHub, push, Actions verdi, prima release; installazione col `install.sh` del pacchetto.
6. La porta e il colore nella tabella del §10.
