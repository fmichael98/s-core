/* Finestre, menu e tendine aperti (Radix): il tasto Indietro del telefono li chiude, e l'aggiornamento dal vivo
   aspetta che si chiudano per non disturbare chi sta scrivendo. */

const OPEN =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [data-radix-popper-content-wrapper] [data-state="open"]'

export const overlayOpen = (): boolean => !!document.querySelector(OPEN)

/** Chiude l'ultima cosa aperta (come Esc); false se non c'era niente. */
export function closeTopOverlay(): boolean {
  if (!overlayOpen()) return false
  const target = document.activeElement ?? document.body
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }))
  return true
}

/** C'è il passo in più nella cronologia (qualcosa è aperto) */
let pushed = false
/** si sta togliendo il passo in più (aspetto che il ritorno arrivi) */
let ignorePop = false
/** cambi di pagina in attesa che il ritorno sia arrivato */
const waiting: (() => void)[] = []

/** la voce in cima alla cronologia è ancora il passo in più (il ritorno chiesto non è ancora arrivato: su un telefono
 *  occupato, per esempio a caricare il 3D, può metterci un po') */
const onOverlayStep = () => !!(history.state as { overlayStep?: boolean } | null)?.overlayStep

function flush() {
  if (ignorePop) return
  for (const fn of waiting.splice(0)) fn()
}

/** Prima di cambiare pagina (da un menu o da una finestra ancora aperti): se in cima alla cronologia c'è il passo in
 *  più, da adesso è della pagina (chiudendo non si torna indietro). `fn` riceve 1 se l'ha preso (la pagina nuova
 *  prende il suo posto invece di aggiungersi), se no 0. Se un ritorno è in corso aspetta che arrivi: fatto prima,
 *  il ritorno toglierebbe la voce della pagina nuova. */
export function withOverlayStep(fn: (taken: 0 | 1) => void): void {
  const run = () => {
    if (pushed && onOverlayStep()) {
      pushed = false
      return fn(1)
    }
    fn(0)
  }
  if (!ignorePop) return run()
  waiting.push(run)
  // se il ritorno non arriva, non resto bloccato
  window.setTimeout(() => {
    const i = waiting.indexOf(run)
    if (i < 0) return
    waiting.splice(i, 1)
    run()
  }, 8000)
}

/** Tasto Indietro (telefono, app installata, browser): se c'è una finestra o un menu aperto lo chiude invece di
 *  lasciare la pagina. Funziona con un passo in più nella cronologia finché qualcosa è aperto. */
export function setupBackButton(): void {
  // si sta già andando a un'altra pagina (es. "Cambia password" dal menu): non tornare indietro
  let leaving = false
  window.addEventListener("beforeunload", () => (leaving = true))
  window.addEventListener("pageshow", () => (leaving = false))
  const sync = () => {
    // in attesa che il passo tolto sia davvero tolto: un passo nuovo adesso verrebbe tolto lui, al posto del vecchio
    // (e il prossimo Indietro uscirebbe dalla pagina): si riprova appena è fatto
    if (leaving || ignorePop) return
    const open = overlayOpen()
    if (open && !pushed) {
      history.pushState({ overlayStep: true }, "")
      pushed = true
    } else if (!open && pushed) {
      // chiuso con un clic o con Esc: tolgo il passo in più
      pushed = false
      ignorePop = true
      history.back()
      // se per qualche motivo il ritorno non arriva, non resto bloccato (ma finché la voce in cima è ancora il passo
      // in più il ritorno è solo in ritardo: aspetto ancora un po')
      const giveUp = (n: number) =>
        window.setTimeout(() => {
          if (!ignorePop) return
          if (onOverlayStep() && n < 10) return giveUp(n + 1)
          ignorePop = false
          flush()
          sync()
        }, 800)
      giveUp(0)
      return
    }
  }
  let queued = false
  new MutationObserver(() => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      sync()
    })
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] })
  window.addEventListener("popstate", () => {
    if (ignorePop) {
      ignorePop = false
      // cambi di pagina chiesti mentre si tornava, poi (intanto si è aperto qualcos'altro, es. chiuso un documento e
      // aperto il caricamento) il suo passo
      flush()
      sync()
      return
    }
    if (pushed) {
      pushed = false
      closeTopOverlay()
    }
  })
  // vecchia app Android (finché qualcuno la usa ancora): il suo tasto Indietro chiede alla pagina
  window.appBack = () => closeTopOverlay()
}

declare global {
  interface Window {
    /** tasto Indietro della vecchia app Android: true se la pagina l'ha gestito */
    appBack?: () => boolean
  }
}
