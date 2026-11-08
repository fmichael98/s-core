#!/usr/bin/env bash
# SApp: scrive la parte di Caddy che riguarda SApp partendo da /etc/sapp/config.toml e ricarica Caddy.
# Lanciato (root) da install.sh e dall'aggiornatore quando si salva la Configurazione dal pannello.
#
# Porte (sul router si inoltrano al server):
#   80      Caddy, solo per ottenere/rinnovare il certificato (la stessa che usa già S Map)
#   19443   SApp da fuori (HTTPS)  -> public_port
set -uo pipefail
CFG=${SAPP_CONFIG:-/etc/sapp/config.toml}
get() { grep -E "^$1[[:space:]]*=" "$CFG" 2>/dev/null | tail -1 | cut -d= -f2- | sed -E 's/#.*//; s/^[[:space:]]*"?//; s/"?[[:space:]]*$//'; }
if ! command -v caddy >/dev/null; then echo "  Caddy non installato: accesso da fuori (HTTPS) non configurato"; exit 0; fi
PUB=$(get public_host); PUB=${PUB#https://}; PUB=${PUB#http://}; PUB=${PUB%/}
PORT=$(get public_port); PORT=${PORT:-19443}
WEB=$(get bind | sed -E 's/.*:([0-9]+)$/\1/'); WEB=${WEB:-8090}
MAIN=/etc/caddy/Caddyfile; CONF=/etc/caddy/conf.d; MINE=$CONF/sapp.caddy
install -d -m 755 "$CONF"
# Caddyfile principale: impostazioni generali + tutti i file di conf.d (S Map, SApp, …)
if ! grep -q '^import /etc/caddy/conf.d/\*.caddy' "$MAIN" 2>/dev/null; then
  [ -f "$MAIN" ] && cp -p "$MAIN" "$MAIN.bak-$(date +%Y%m%d-%H%M%S)" && echo "  Caddyfile precedente salvato in $MAIN.bak-…"
  cat > "$MAIN" <<'CF'
# Caddy: ingresso unico per tutti i servizi HTTPS su questo server.
# Ogni servizio ha il suo file in /etc/caddy/conf.d/<nome>.caddy
{
	servers {
		# solo HTTP/1.1 e HTTP/2 (HTTP/3 usa UDP, di solito non inoltrato dal router)
		protocols h1 h2
	}
}
import /etc/caddy/conf.d/*.caddy
CF
fi
OLD=$(cat "$MINE" 2>/dev/null || true)
if [ -z "$PUB" ] || [ "$PORT" = "0" ]; then
  rm -f "$MINE"; echo "  SApp da fuori: spento (indirizzo pubblico vuoto o porta 0)"
else
  {
    echo "# Generato da SApp dalla Configurazione: NON modificare a mano (si riscrive)."
    echo "$PUB:$PORT {"
    echo "	encode zstd gzip"
    echo "	reverse_proxy 127.0.0.1:$WEB"
    echo "}"
  } > "$MINE"
  echo "  SApp da fuori: https://$PUB:$PORT"
fi
if ! caddy validate --config "$MAIN" --adapter caddyfile >/dev/null 2>&1; then
  echo "  ATTENZIONE: configurazione di Caddy non valida, ripristino la precedente"
  if [ -n "$OLD" ]; then printf '%s\n' "$OLD" > "$MINE"; else rm -f "$MINE"; fi
  caddy validate --config "$MAIN" --adapter caddyfile 2>&1 | tail -3
  exit 1
fi
systemctl reload caddy 2>/dev/null || systemctl restart caddy 2>/dev/null || true
echo "  Caddy aggiornato"
