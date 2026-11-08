# SApp — server Ubuntu (10.9.8.200)

## Porte
| Uso | Porta | Dove |
|---|---|---|
| Pagina in casa | 8090 | http://10.9.8.200:8090 |
| Da fuori (HTTPS, Caddy) | 19443 | https://DDNS:19443 — da inoltrare sul MikroTik (WAN + "da LAN") |
| Certificato HTTPS | 80 | già inoltrata per S Map |

## 1. Prima installazione (una volta, da SSH)
    scp ~/Downloads/s-app-v1.0.0.zip user@10.9.8.200:~
    ssh user@10.9.8.200
    unzip -o s-app-v1.0.0.zip && cd s-app-v1.0.0 && sudo ./install.sh

Chiede la password di **admin**. Poi `http://10.9.8.200:8090` → accedi come **admin** → Utenti → **+ Utente** (es. `michael`) → esci →
accedi come `michael` / `michael` → scegli la tua password.

## 2. Aggiornamenti successivi
Alza `version` in `Cargo.toml` (e una voce in `CHANGELOG.md`) → push → GitHub pubblica `s-app-vX.Y.Z.zip`.
Pannello admin → **Aggiornamenti** → carica lo zip → **Installa** (copia del database prima; se non parte torna alla precedente).

## 3. Utile da SSH
- Log: `journalctl -u sapp -f`
- Password di admin dimenticata: `sudo -u sapp sapp reset-password admin`
- Config: `/etc/sapp/config.toml` · dati: `/var/lib/sapp/sapp.db` · copie: `/var/lib/sapp/backup`
