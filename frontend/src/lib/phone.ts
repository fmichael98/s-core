/* Dentro l'app Android la pagina gira in una WebView che espone `SAppApp`: da lì si aprono le impostazioni del
   telefono (permessi, funzioni proprie dell'app), si aggiorna l'app e si esce dall'app invece che dalla sola
   pagina. Fuori dall'app: l'APK si scarica dal server. */

import { useEffect, useState } from "react"
import type { ApkInfo } from "@/lib/types"

interface PhoneBridge {
  /** Apre la schermata nativa del telefono (permessi, funzioni proprie, aggiornamento). */
  openPhone(): void
  /** Esce dall'app (chiude la sua sessione e torna all'accesso). */
  logout(): void
  /** Versione dell'app. */
  version(): string
  /** Scarica e installa l'app nuova (le app vecchie potrebbero non averlo). */
  updateApp?(): void
  /** Salva in Download un file fatto dalla pagina (contenuto in base64): nella WebView i link «blob:» non scaricano. */
  saveFile?(name: string, mime: string, base64: string): void
}

export const phone: PhoneBridge | undefined = (window as unknown as { SAppApp?: PhoneBridge }).SAppApp

/** Dentro l'app: salva un file fatto dalla pagina in Download (true se ci ha pensato l'app). Le pagine lo usano al
 *  posto del link «blob:» con `download`. */
export async function saveInApp(file: Blob, name: string): Promise<boolean> {
  if (!phone?.saveFile) return false
  const data = await new Promise<string>((ok, ko) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ""))
    r.onerror = () => ko(r.error)
    r.readAsDataURL(file)
  })
  phone.saveFile(name, file.type || "application/octet-stream", data)
  return true
}

/** Indirizzo dell'APK sul server. */
export const APK_URL = "/app/sapp.apk"

/** Versione dell'app Android che apre la pagina (dal suo User-Agent), o null nel browser. */
export function appVersion(): string | null {
  const m = navigator.userAgent.match(/SAppApp\/([\d.]+)/)
  return m ? m[1] : null
}

/** `a` è più recente di `b`? ("2.10" > "2.9") */
export function verGt(a: string, b: string): boolean {
  const x = a.split(".").map(Number)
  const y = b.split(".").map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  }
  return false
}

/** L'app ha un'app Android (l'APK arriva col pacchetto del server)? Le app che non ce l'hanno mettono false: niente
 *  richiesta a /api/app e «Installa» propone solo la web app. */
const HAS_ANDROID = true

let cached: Promise<ApkInfo | null> | null = null

/** L'app Android sul server (una richiesta sola per pagina; pubblica: serve anche prima di entrare). */
function loadApk(): Promise<ApkInfo | null> {
  if (!HAS_ANDROID) return Promise.resolve(null)
  cached ??= fetch("/api/app", { credentials: "same-origin" })
    .then((r) => (r.ok ? (r.json() as Promise<ApkInfo>) : null))
    .catch(() => null)
  return cached
}

export function useApk(): ApkInfo | null {
  const [apk, setApk] = useState<ApkInfo | null>(null)
  useEffect(() => {
    let alive = true
    void loadApk().then((a) => alive && setApk(a))
    return () => {
      alive = false
    }
  }, [])
  return apk
}

/** Dentro l'app: la versione più nuova che c'è sul server, se l'app è vecchia. */
export function useAppUpdate(): string | null {
  const apk = useApk()
  const mine = appVersion()
  if (!phone || !mine || !apk?.available || !apk.version) return null
  return verGt(apk.version, mine) ? apk.version : null
}

/** Aggiorna l'app: ci pensa lei (download e installazione); se è troppo vecchia, dalla sua schermata nativa. */
export function updateApp(): void {
  if (phone?.updateApp) phone.updateApp()
  else if (phone) phone.openPhone()
  else location.href = APK_URL
}
