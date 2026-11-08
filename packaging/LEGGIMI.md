# SApp

App della famiglia S (porta 8090 in casa, 19443 HTTPS da fuori).
L'utente **admin** gestisce solo utenti, configurazione e aggiornamenti; ogni altro utente usa l'app.

## Installazione — da SSH
    unzip s-app-vX.Y.Z.zip && cd s-app-vX.Y.Z
    sudo ./install.sh

Prima installazione: chiede la password di **admin**. Poi dal pannello (Utenti → + Utente) crei il tuo utente:
password iniziale = nome utente, da cambiare al primo accesso.

## Dopo, tutto dalla pagina web
Pannello dell'amministratore: utenti, configurazione (porta, indirizzo pubblico, sicurezza), aggiornamenti (copia del
database prima; se non parte torna alla precedente), sistema.

## Utile da SSH
- Log: `journalctl -u sapp -f`
- Password di admin dimenticata: `sudo -u sapp sapp reset-password admin`
- Config: `/etc/sapp/config.toml` · dati: `/var/lib/sapp/sapp.db` · copie: `/var/lib/sapp/backup`
