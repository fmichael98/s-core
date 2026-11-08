/* Web app installabile da telefono, tablet e PC: service worker, richiesta di installazione del browser,
   iPhone/iPad (a mano dal menu Condividi). */

/** L'evento che Chrome/Edge mandano quando la pagina si può installare. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export type InstallState =
  /** già aperta come app */
  | "installed"
  /** già installata su questo dispositivo, ma aperta dal browser */
  | "elsewhere"
  /** il browser può installarla: basta un tocco */
  | "ready"
  /** iPhone/iPad: Condividi → Aggiungi alla schermata Home */
  | "ios"
  /** indirizzo non sicuro (http): l'installazione si fa dall'indirizzo https */
  | "insecure"
  /** il browser non l'ha (ancora) proposta: si fa dal suo menu */
  | "manual"

let deferred: InstallPromptEvent | null = null
let justInstalled = false
/** già installata su questo dispositivo (visto aprendola come app, o detto dal browser) */
let installedHere = false
let httpsUrl: string | null = null
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((l) => l())

export const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** Ricordo che è installata: aperta come app o dal browser la memoria è la stessa. */
const KEY = "sapp.installed"
const remember = (yes: boolean) => {
  installedHere = yes
  try {
    if (yes) localStorage.setItem(KEY, "1")
    else localStorage.removeItem(KEY)
  } catch {
    /* senza memoria del browser: vale solo per questa volta */
  }
}

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)

/** Telefono o tablet (non PC). */
export const isMobileDevice = (): boolean =>
  (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile === true || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || isIOS()

export function installState(): InstallState {
  if (standalone() || justInstalled) return "installed"
  if (deferred) return "ready"
  if (installedHere) return "elsewhere"
  if (isIOS()) return "ios"
  if (!window.isSecureContext) return "insecure"
  return "manual"
}

/** Indirizzo https da cui installarla (se configurato sul server), quando la pagina è aperta in http. */
export const installUrl = (): string | null => httpsUrl

export function onInstallChange(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Mostra la richiesta di installazione del browser; true se accettata. */
export async function install(): Promise<boolean> {
  const e = deferred
  if (!e) return false
  await e.prompt()
  const { outcome } = await e.userChoice
  deferred = null
  if (outcome === "accepted") justInstalled = true
  changed()
  return outcome === "accepted"
}

/** Da chiamare all'avvio di ogni pagina. */
export function setupPwa(): void {
  try {
    installedHere = localStorage.getItem(KEY) === "1"
  } catch {
    /* niente */
  }
  if (standalone()) remember(true)
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault() // il pulsante lo mettiamo noi
    deferred = e as InstallPromptEvent
    remember(false) // il browser la propone: quindi non è (più) installata
    changed()
  })
  window.addEventListener("appinstalled", () => {
    deferred = null
    justInstalled = true
    remember(true)
    changed()
  })
  window.matchMedia("(display-mode: standalone)").addEventListener("change", changed)
  // Chrome sa dire se è già installata (manifest → related_applications)
  const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> }
  if (window.isSecureContext && nav.getInstalledRelatedApps) {
    nav
      .getInstalledRelatedApps()
      .then((apps) => {
        if (apps.length > 0 && !deferred) {
          remember(true)
          changed()
        }
      })
      .catch(() => {})
  }
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* senza service worker la pagina funziona lo stesso */
    })
  }
  // aperta in http: chiedo al server l'indirizzo https da proporre
  if (!window.isSecureContext) {
    fetch("/api/version", { cache: "no-store" })
      .then((r) => r.json())
      .then((v: { https?: string | null }) => {
        httpsUrl = v.https ?? null
        changed()
      })
      .catch(() => {})
  }
}
