"""Nuova app della famiglia S a partire da s-core: copia il modello e cambia i nomi.

Uso (dalla cartella di s-core):
    python3 tools/nuova-app.py ../s-note snote SNote 8095 20443

    ../s-note   cartella nuova (il nome è anche quello del repository: s-note)
    snote       nome breve: programma, servizio, utente di sistema, cartelle (/var/lib/snote), crate (snote-http…)
    SNote       nome mostrato (S + Note: «S» bianco, il resto nel colore dell'app)
    8095        porta della rete di casa
    20443       porta HTTPS da fuori (Caddy)

Cambia anche il segno del database (PRAGMA application_id, dalle prime quattro lettere del nome breve) e lascia il
colore blu di esempio: il colore dell'app va messo in frontend/src/index.css (--primary, --ring) e nelle icone
(tools/icone.py). Dopo: cd frontend && npm ci && npm run build; cd .. && cargo test. Vedi GUIDA.md, «Nuova app».
"""

import os
import re
import shutil
import sys
from pathlib import Path

if len(sys.argv) != 6:
    sys.exit(__doc__)
dest, short, name, lan, public = Path(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
if not re.fullmatch(r"[a-z][a-z0-9]{2,20}", short):
    sys.exit("nome breve: lettere minuscole e cifre (es. snote)")
if not re.fullmatch(r"S[A-Z][A-Za-z0-9]+", name):
    sys.exit("nome mostrato: S + nome con la maiuscola (es. SNote)")
if dest.exists():
    sys.exit(f"{dest} esiste già")
repo = dest.resolve().name
src = Path(__file__).resolve().parent.parent

SKIP = {".git", "target", "node_modules", "dist"}
shutil.copytree(src, dest, ignore=lambda d, names: [n for n in names if n in SKIP])

app_id = "".join(f"{ord(c):02X}" for c in short[:4].upper().ljust(4, "_"))
subs = [
    ('"SAPP" (0x53415050)', f'"{short[:4].upper()}" (0x{app_id})'),
    ("0x5341_5050", f"0x{app_id[:4]}_{app_id[4:]}"),
    ("SAPP", short.upper()),
    ("SAppApp", f"{name}App"),
    ("SApp", name),
    ("s-app", repo),
    ("sapp", short),
]
# le porte solo dove sono porte (un numero così può stare anche altrove)
PORT_FILES = {"config.rs", "config.example.toml", "caddy-sync.sh", "install.sh", "INSTALLAZIONE.md", "README.md", "LEGGIMI.md"}
# nel package-lock ci sono impronte in base64: lì solo il nome del pacchetto
SKIP_FILES = {"package-lock.json"}
for root, dirs, files in os.walk(dest):
    for f in files:
        p = Path(root) / f
        if f in SKIP_FILES:
            p.write_text(p.read_text(encoding="utf-8").replace('"sapp-frontend"', f'"{short}-frontend"'), encoding="utf-8")
            continue
        if p.suffix in {".png", ".ico", ".jks", ".jar", ".woff2"}:
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        new = text
        for a, b in subs:
            new = new.replace(a, b)
        if f in PORT_FILES:
            new = new.replace("8090", lan).replace("19443", public)
        if new != text:
            p.write_text(new, encoding="utf-8")
    for f in files:
        if "sapp" in f:
            (Path(root) / f).rename(Path(root) / f.replace("sapp", short))

# la pagina dell'app di esempio la sostituisce quella vera: si parte dal nome
brand = dest / "frontend/src/components/brand.tsx"
brand.write_text(brand.read_text().replace('const BRAND = "App"', f'const BRAND = "{name[1:]}"'))
# la guida resta in s-core; all'app un README suo da completare
for doc in ["GUIDA.md", "tools/nuova-app.py"]:
    (dest / doc).unlink(missing_ok=True)
(dest / "README.md").write_text(f"""# {name}

App della famiglia S (nata da [s-core](https://github.com/fmichael98/s-core)): server Rust diviso in crate
(architettura esagonale), pagina React + shadcn/ui, un solo programma sul server Ubuntu.

Porta **{lan}** in casa, **{public}** HTTPS da fuori (Caddy). Istruzioni in `INSTALLAZIONE.md`.
Ogni push su `main` compila e pubblica `{repo}-vX.Y.Z.zip` nelle **Releases** (versione in `Cargo.toml`).

## Sviluppo
    cd frontend && npm ci && npm run build && cd ..
    cargo test
    cargo run -p {short} -- hash-password          # impronta per password_hash nel config di prova
    cargo run -p {short} -- --config prova.toml    # (copia di packaging/config.example.toml, database in /tmp)
""", encoding="utf-8")
print(f"""{name} pronta in {dest}
  1. colore: frontend/src/index.css (--primary, --ring) e icone: python3 tools/icone.py "#RRGGBB" glifo frontend/public
  2. README.md, frontend/public/manifest.json (descrizione), CHANGELOG.md
  3. cd {dest}/frontend && npm ci && npm run build && cd .. && cargo test
  4. git init, repository {repo} su GitHub, push: GitHub Actions compila e pubblica la prima release""")
