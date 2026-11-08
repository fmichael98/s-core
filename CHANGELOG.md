# SApp — novità per versione

Ogni versione: `## numero` e sotto le voci `- …` (sono pubbliche su `/api/changelog` e le pagine le mostrano dopo un
aggiornamento).

## 1.0.2
- Isola: risponde a ogni tocco (al rilascio del dito, anche col contenuto che scorre ancora), un po' più in alto, i gesti non partono da lì
- `lib/overlays.ts`: se Radix lascia `pointer-events: none` sul body con niente di aperto (finestra aperta da una voce di menu), lo toglie: prima la pagina smetteva di rispondere ai tocchi
- `components/gestures.tsx`: nessun `preventDefault` prima che il gesto sia deciso (sotto i 10 px è un tocco)

## 1.0.1
- Menu utente: voci con numeri (`badge` rosso anche sull'avatar, `count` solo sulla voce), gruppi, voci in fondo, collegamenti, avatar con immagine
- `lib/phone.ts`: `HAS_ANDROID` per le app senza app Android (niente richiesta a /api/app)

## 1.0.0
- App di esempio di s-core: accesso, utenti, pannello dell'amministratore, aggiornamenti dal pannello, web app e app Android
