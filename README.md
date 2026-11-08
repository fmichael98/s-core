# s-core

La raccolta di quello che hanno in comune le app della famiglia S (STurni, SGarage, SCalendar…): server, pagina
web, pacchetto e rilascio. Le app nuove nascono da qui, quelle esistenti ci prendono i pezzi.

**Non è una dipendenza.** Nessuna app la usa da `Cargo.toml` o da `package.json`: si **copia** quello che serve e da
lì in poi il codice è dell'app. Quando un pezzo migliora in un'app e serve a tutte, si riporta qui.

## Cosa c'è
- **SApp**, un'app di esempio completa e funzionante (è quella che le Actions compilano e provano a ogni modifica):
  accesso, utenti, pannello dell'amministratore, aggiornamenti dal pannello, web app installabile, app Android
  scaricabile dal server, aggiornamento dal vivo. Il dominio è vuoto: è il posto dove va quello dell'app.
  - `crates/` server Rust (architettura esagonale: domain · app · sqlite · system · http · server)
  - `frontend/` pagina React + shadcn/ui (Vite, Tailwind v4)
  - `packaging/` install.sh, aggiornatore, Caddy, systemd
  - `.github/workflows/release.yml` compila, prova e pubblica la release
- **[GUIDA.md](GUIDA.md)**: tutte le caratteristiche comuni, una per una, con le regole e da dove vengono.
- `tools/nuova-app.py` crea un'app nuova copiando SApp e cambiando i nomi; `tools/icone.py` fa le icone.

## Nuova app
    python3 tools/nuova-app.py ../s-note snote SNote 8095 20443
Poi colore e icone, e il dominio dell'app (vedi GUIDA.md, «Nuova app»).

## Provare SApp
    cd frontend && npm ci && npm run build && cd ..
    cargo test
    cargo run -p sapp -- hash-password             # impronta per password_hash
    cargo run -p sapp -- --config prova.toml       # copia di packaging/config.example.toml con database in /tmp

## Il guscio di prima
Fino alla 0.9.6 s-core era una dipendenza (il guscio `shell.js`/`shell.css` di SMoney, SHealth, SNotes, SMonitor):
è rimasto, com'era, nel ramo [`guscio-v1`](https://github.com/fmichael98/s-core/tree/guscio-v1).
