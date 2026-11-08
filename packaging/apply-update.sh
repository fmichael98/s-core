#!/usr/bin/env bash
# SApp: lanciato da sapp-update.path (root) quando il pannello crea /var/lib/sapp/update/ready.
#   ready = "pkg"    -> installa il pacchetto pkg.zip con il suo install.sh
#   ready = "config" -> installa config.new come /etc/sapp/config.toml, aggiorna Caddy, riavvia
# Avanzamento in update.log, esito in result ("ok …", "err …", "rollback …").
set -u
# tutto dentro main: bash legge lo script intero prima di eseguirlo (install.sh lo sostituisce mentre gira)
main() {
D=/var/lib/sapp/update
CFG=/etc/sapp/config.toml
BIN=/usr/local/bin/sapp
[ -f "$D/ready" ] || exit 0
WHAT=$(head -1 "$D/ready" | tr -cd 'a-z')
rm -f "$D/ready" "$D/result"
touch "$D/running"
LOG=$D/update.log
: > "$LOG"; chown sapp:sapp "$LOG" 2>/dev/null; chmod 644 "$LOG"
W=$(mktemp -d /root/sapp-update.XXXXXX)
finish() { echo "$1" > "$D/result"; chown sapp:sapp "$D/result" 2>/dev/null; rm -f "$D/running"; rm -rf "$W"; }
exec >>"$LOG" 2>&1

if [ "$WHAT" = "config" ]; then
  N=$D/config.new
  echo "Configurazione nuova dal pannello"
  [ -f "$N" ] || { echo "file della configurazione non trovato"; finish "err: file mancante"; exit 1; }
  if ! "$BIN" check-config "$N"; then echo "configurazione non valida: non applicata"; rm -f "$N"; finish "err: configurazione non valida"; exit 1; fi
  cp -p "$CFG" "$CFG.bak" && echo "copia di sicurezza: $CFG.bak"
  install -m 640 -o root -g sapp "$N" "$CFG"; rm -f "$N"
  [ -x /usr/local/lib/sapp/caddy-sync.sh ] && /usr/local/lib/sapp/caddy-sync.sh
  echo "riavvio SApp…"
  systemctl restart sapp; sleep 4
  if systemctl is-active --quiet sapp; then
    echo; echo "CONFIGURAZIONE APPLICATA"; finish "ok configurazione applicata"; exit 0
  fi
  echo "SApp non riparte con la configurazione nuova: rimetto la precedente"
  install -m 640 -o root -g sapp "$CFG.bak" "$CFG"
  [ -x /usr/local/lib/sapp/caddy-sync.sh ] && /usr/local/lib/sapp/caddy-sync.sh
  systemctl restart sapp
  finish "rollback: con la configurazione nuova SApp non partiva"; exit 1
fi

# ---- pacchetto completo
P=$D/pkg.zip
echo "Aggiornamento da pacchetto"
[ -f "$P" ] || { echo "pacchetto non trovato"; finish "err: pacchetto mancante"; exit 1; }
# firma (se il programma installato ce l'ha attiva): la controlla di nuovo root, con il programma già installato
echo "Controllo del pacchetto…"
if ! timeout 120 "$BIN" verify-package "$P"; then echo "pacchetto non valido: non installo"; rm -f "$P"; finish "err: firma del pacchetto non valida"; exit 1; fi
echo "Estrazione…"
if command -v unzip >/dev/null; then unzip -q "$P" -d "$W"; else python3 -m zipfile -e "$P" "$W"; fi || { echo "zip non valido"; finish "err: zip non valido"; exit 1; }
SRC=$(find "$W" -maxdepth 2 -name install.sh -printf '%h\n' | head -1)
[ -n "$SRC" ] || { echo "install.sh non trovato nel pacchetto"; finish "err: install.sh mancante"; exit 1; }
chmod +x "$SRC/install.sh" "$SRC/sapp" 2>/dev/null
if (cd "$SRC" && SAPP_UNATTENDED=1 ./install.sh); then
  rm -f "$P" "$D/staged.version" "$D/sapp.new"
  echo; echo "AGGIORNAMENTO RIUSCITO"; finish "ok $("$BIN" --version)"
else
  rm -f "$D/sapp.new"
  echo; echo "AGGIORNAMENTO NON RIUSCITO (copia del database in /var/lib/sapp/backup)"; finish "err: aggiornamento non riuscito, vedi registro"; exit 1
fi
}
main "$@"
exit $?
