"""Icone della web app (e favicon): un glifo di Lucide bianco su un quadrato del colore dell'app, come tutte le app S.

Uso:  python3 tools/icone.py "#2563EB" box frontend/public
      (colore, nome dell'icona Lucide — https://lucide.dev/icons — o file .svg, cartella di uscita)

Serve Playwright (pip install playwright && playwright install chromium) e Pillow. Il glifo si prende dal pacchetto
lucide-static se c'è in frontend/node_modules, altrimenti da un file .svg passato al posto del nome.
"""

import re
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

if len(sys.argv) != 4:
    sys.exit(__doc__)
COLOR, NAME, OUT = sys.argv[1], sys.argv[2], Path(sys.argv[3])


def glyph(name: str) -> str:
    """Il contenuto (path, rect…) dell'SVG di Lucide, senza l'elemento <svg> esterno."""
    p = Path(name)
    if not p.suffix:
        for base in [Path("frontend/node_modules/lucide-static/icons"), Path("node_modules/lucide-static/icons")]:
            if (base / f"{name}.svg").exists():
                p = base / f"{name}.svg"
                break
    if not p.exists():
        sys.exit(f"glifo «{name}» non trovato: passa un file .svg (es. scaricato da lucide.dev)")
    svg = p.read_text()
    inner = re.search(r"<svg[^>]*>(.*)</svg>", svg, re.S)
    return re.sub(r"\s+", " ", inner.group(1)).strip() if inner else sys.exit("SVG non valido")


GLYPH = glyph(NAME)


def icon_svg(size: int, maskable: bool = False, round_: bool = True) -> str:
    scale = (0.40 if maskable else 0.52) * size / 24
    off = (size - 24 * scale) / 2
    r = 0 if (maskable or not round_) else size * 0.225
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">
<rect width="{size}" height="{size}" rx="{r}" fill="{COLOR}"/>
<g transform="translate({off:.3f} {off:.3f}) scale({scale:.4f})" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{GLYPH}</g>
</svg>"""


def render(page, svg: str, size: int, path: Path) -> None:
    page.set_viewport_size({"width": size, "height": size})
    page.set_content(f'<html><body style="margin:0;background:transparent">{svg}</body></html>')
    page.locator("svg").screenshot(path=str(path), omit_background=True)


OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    for s in [96, 144, 192, 384, 512]:
        render(page, icon_svg(s), s, OUT / f"icon-{s}.png")
    for s in [192, 512]:
        render(page, icon_svg(s, maskable=True), s, OUT / f"icon-maskable-{s}.png")
    render(page, icon_svg(180, round_=False), 180, OUT / "apple-touch-icon.png")
    render(page, icon_svg(64), 64, OUT / "favicon.png")
    render(page, icon_svg(256), 256, OUT / "fav-256.png")
    b.close()

Image.open(OUT / "fav-256.png").save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
(OUT / "fav-256.png").unlink()
(OUT / "favicon.svg").write_text(f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="{COLOR}"/>
<g transform="translate(13.76 13.76) scale(1.52)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{GLYPH}</g>
</svg>
""")
print("icone pronte in", OUT)
