"""Pagine dentro lo schermo dei telefoni stretti: cosa esce a destra a 360 e 320 px, anche col testo grande (130%).
Quello che sta in un riquadro che scorre di lato (es. una tabella larga) va bene; quello tagliato da un riquadro sì.

Uso:  python3 tools/schermi.py http://127.0.0.1:8090 utente password "#/" "#/elenco" "#settings"
      (con l'app avviata; le sezioni sono gli indirizzi dopo la pagina principale)

Per ogni larghezza e sezione scrive quanti elementi escono e i primi, e salva un'immagine in /tmp/schermi/.
Esce con errore se qualcosa esce dallo schermo. Serve Playwright (pip install playwright && playwright install chromium).
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

if len(sys.argv) < 5:
    sys.exit(__doc__)
BASE, USER, PASSWORD, PAGES = sys.argv[1].rstrip("/"), sys.argv[2], sys.argv[3], sys.argv[4:]
OUT = Path("/tmp/schermi")
OUT.mkdir(exist_ok=True)

# elementi che finiscono oltre il bordo destro (con un margine di mezzo pixel)
FUORI = """() => {
  const W = document.documentElement.clientWidth
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.right > W + 0.5 && getComputedStyle(el).position !== 'fixed') {
      // dentro un riquadro che scorre di lato (tabelle larghe): va bene; dentro uno che taglia: è tagliato
      let cut = ''
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX
        if (o !== 'visible' && p.getBoundingClientRect().right <= W + 0.5) { cut = o === 'auto' || o === 'scroll' ? 'scorre' : 'TAGLIATO '; break }
      }
      if (cut === 'scorre') continue
      const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString()
      out.push(`${cut}${el.tagName.toLowerCase()} «${(el.innerText || '').slice(0, 30).replace(/\\n/g, ' ')}» ${Math.round(r.right)}px  ${cls.slice(0, 70)}`)
    }
  }
  return out
}"""

errori = 0
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (360, 320):
        for big in (False, True):
            ctx = browser.new_context(
                viewport={"width": width, "height": 780}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme="dark"
            )
            page = ctx.new_page()
            page.goto(BASE + "/login")
            page.fill("input[name=username]", USER)
            page.fill("input[name=password]", PASSWORD)
            page.click("button[type=submit]")
            page.wait_for_timeout(1500)
            for path in PAGES:
                page.goto(BASE + "/")
                page.goto(BASE + "/" + path)
                page.reload()
                page.wait_for_timeout(1200)
                if big:
                    page.add_style_tag(content="html{font-size:130% !important}")
                    page.wait_for_timeout(400)
                fuori = page.evaluate(FUORI)
                nome = f"{width}{'-grande' if big else ''}-{path.strip('#/').replace('/', '_') or 'home'}"
                page.screenshot(path=str(OUT / f"{nome}.png"))
                stato = "ok" if not fuori else f"{len(fuori)} fuori"
                print(f"{width} px{' testo grande' if big else ''}  {path:<20} {stato}")
                for f in fuori[:5]:
                    print("    ", f)
                errori += bool(fuori)
            ctx.close()
    browser.close()
print(f"\nimmagini in {OUT}")
sys.exit(1 if errori else 0)
