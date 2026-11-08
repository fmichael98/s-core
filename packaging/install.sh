#!/usr/bin/env bash
# Installa / aggiorna SApp. Uso: sudo ./install.sh
# Usato anche dall'aggiornamento dal pannello (SAPP_UNATTENDED=1): niente domande.
set -euo pipefail
cd "$(dirname "$0")"
[ "$(id -u)" -eq 0 ] || { echo "Lancialo con sudo: sudo ./install.sh"; exit 1; }
T0=$(date +%s); TOT=7
step() { printf '\n[%s/%s] %s  (%ss)\n' "$1" "$TOT" "$2" "$(( $(date +%s) - T0 ))"; }

BIN=./sapp
NEWVER=$("$BIN" --version 2>/dev/null | awk '{print $2}') || { echo "Il programma non gira su questo sistema (serve Ubuntu 24.04+ x86_64)."; exit 1; }
echo "=== SApp $NEWVER — installazione ==="
CFG=/etc/sapp/config.toml

step 1 "Utente di sistema e cartelle"
id sapp >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin sapp
for d in /var/lib/sapp /var/lib/sapp/update /var/lib/sapp/app /var/lib/sapp/backup; do install -d -o sapp -g sapp -m 750 "$d"; done
install -d -m 755 /etc/sapp

step 2 "Configurazione"
# indirizzo pubblico: lo stesso DDNS di S Map, se c'è
DDNS=$(grep -E '^GPS_PUBLIC_HOST=' /etc/gpstrack.env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '[:space:]"' || true)
if [ ! -f "$CFG" ]; then
  [ "${SAPP_UNATTENDED:-0}" = 1 ] && { echo "  manca $CFG: la prima installazione va fatta da SSH"; exit 1; }
  cp config.example.toml "$CFG"
  while :; do
    read -rsp "Password dell'amministratore (utente admin, min. 8 caratteri): " PW; echo
    read -rsp "Ripetila: " PW2; echo
    [ "$PW" = "$PW2" ] && [ ${#PW} -ge 8 ] && break
    echo "  Non coincidono o troppo corta, riprova."
  done
  HASH=$(printf '%s\n' "$PW" | "$BIN" hash-password 2>/dev/null | grep '^password_hash' | cut -d'"' -f2)
  unset PW PW2
  sed -i "s|INCOLLA_QUI_L_HASH|$HASH|" "$CFG"
  [ -n "$DDNS" ] && sed -i "s|^public_host = \"\"|public_host = \"$DDNS\"|" "$CFG" && echo "  indirizzo pubblico (da S Map): $DDNS"
  NEW=1
else
  echo "  config esistente mantenuto"
fi
# chiavi nuove aggiunte senza toccare il resto
addkey() { grep -qE "^$1[[:space:]]*=" "$CFG" || { printf '\n%s\n%s = %s\n' "$2" "$1" "$3" >> "$CFG"; echo "  aggiunto $1"; }; }
addkey public_host "# Accesso da fuori in HTTPS (Caddy): indirizzo pubblico (DDNS), vuoto = solo rete locale" "\"$DDNS\""
addkey public_port "# Porta HTTPS pubblica (standard SApp 19443), 0 = spento" "19443"
addkey max_fails "# Tentativi di accesso sbagliati prima del blocco (per IP)" "5"
addkey lock_minutes "# Minuti di blocco" "15"
"$BIN" check-config "$CFG" >/dev/null || { echo "  ERRORE nel config: $CFG"; "$BIN" check-config "$CFG"; exit 1; }
chown root:sapp "$CFG"; chmod 640 "$CFG"

step 3 "Copia di sicurezza del database (si tengono le ultime 10)"
DB=$(grep -E '^database[[:space:]]*=' "$CFG" | tail -1 | cut -d'"' -f2); DB=${DB:-/var/lib/sapp/sapp.db}
if [ -f "$DB" ]; then
  OLDVER=$(/usr/local/bin/sapp --version 2>/dev/null | awk '{print $2}' || true)
  BK=/var/lib/sapp/backup/$(date +%Y%m%d-%H%M%S)-v${OLDVER:-precedente}.db
  if command -v sqlite3 >/dev/null; then sqlite3 "$DB" ".backup '$BK'"; else
    systemctl stop sapp 2>/dev/null || true; cp -p "$DB" "$BK"; [ -f "$DB-wal" ] && cp -p "$DB-wal" "$BK-wal"; fi
  chown sapp:sapp "$BK"* 2>/dev/null || true
  echo "  $BK"
  ls -1t /var/lib/sapp/backup/*.db 2>/dev/null | tail -n +11 | while read -r f; do rm -f "$f" "$f-wal"; done
else
  echo "  nessun database (prima installazione)"
fi

step 4 "Programma"
[ -f /usr/local/bin/sapp ] && cp -pf /usr/local/bin/sapp /usr/local/bin/sapp.prev
install -m 755 "$BIN" /usr/local/bin/sapp
echo "  $(/usr/local/bin/sapp --version)"
# app Android: l'APK del pacchetto ("SApp X.Y.apk") la offre il server ai telefoni
if compgen -G "./*.apk" >/dev/null || compgen -G "app/*.apk" >/dev/null; then
  rm -f /var/lib/sapp/app/*.apk
  for a in ./*.apk app/*.apk; do
    [ -f "$a" ] || continue
    install -o sapp -g sapp -m 640 "$a" "/var/lib/sapp/app/$(basename "$a" | sed -E 's/^SApp[-_ ]?/SApp /')"
  done
  echo "  app Android: $(ls /var/lib/sapp/app)"
fi

step 5 "Servizio, aggiornatore dal pannello, Caddy"
install -m 644 sapp.service /etc/systemd/system/sapp.service
install -d -m 755 /usr/local/lib/sapp
install -m 755 apply-update.sh /usr/local/lib/sapp/apply-update.sh
install -m 755 caddy-sync.sh /usr/local/lib/sapp/caddy-sync.sh
install -m 644 sapp-update.path sapp-update.service /etc/systemd/system/
# versione dell'aggiornatore (il programma la controlla per sapere che c'è)
echo 3 > /var/lib/sapp/update/.helper; chown sapp:sapp /var/lib/sapp/update/.helper
systemctl daemon-reload
systemctl enable --now sapp-update.path >/dev/null 2>&1 || true
/usr/local/lib/sapp/caddy-sync.sh || echo "  (Caddy non aggiornato: vedi sopra)"

step 6 "Avvio"
systemctl enable sapp >/dev/null 2>&1
systemctl restart sapp

step 7 "Verifica"
PORT=$(grep -E '^bind[[:space:]]*=' "$CFG" | tail -1 | cut -d'"' -f2 | sed -E 's/.*:([0-9]+)$/\1/'); PORT=${PORT:-8090}
OK=""
for i in $(seq 1 20); do
  # deve rispondere proprio SApp (non un altro servizio sulla stessa porta)
  if curl -fsS "http://127.0.0.1:$PORT/api/version" 2>/dev/null | grep -q '"app":"sapp"'; then OK=1; break; fi
  sleep 1
done
if [ -z "$OK" ]; then
  echo "  SApp non risponde sulla porta $PORT (o la porta è già usata da un altro servizio): torno alla versione precedente"
  journalctl -u sapp -n 15 --no-pager || true
  if [ -f /usr/local/bin/sapp.prev ]; then
    install -m 755 /usr/local/bin/sapp.prev /usr/local/bin/sapp; systemctl restart sapp
  fi
  exit 1
fi
echo "  risponde: $(curl -fsS "http://127.0.0.1:$PORT/api/version")"

IP=$(hostname -I | awk '{print $1}')
PUB=$(grep -E '^public_host[[:space:]]*=' "$CFG" | tail -1 | cut -d'"' -f2)
PP=$(grep -E '^public_port[[:space:]]*=' "$CFG" | tail -1 | sed -E 's/.*=[[:space:]]*([0-9]+).*/\1/')
echo
echo "=== Fatto in $(( $(date +%s) - T0 )) secondi ==="
echo "  In casa:   http://$IP:$PORT   (amministratore: admin)"
[ -n "$PUB" ] && [ "${PP:-0}" != 0 ] && echo "  Da fuori:  https://$PUB:$PP"
[ "${NEW:-0}" = 1 ] && echo "  Config: $CFG · dati: $DB"
exit 0
