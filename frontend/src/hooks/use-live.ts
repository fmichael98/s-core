import { useEffect } from "react"
import { toast } from "sonner"
import { setOnline } from "@/lib/api"
import { overlayOpen } from "@/lib/overlays"
import { refresh } from "@/hooks/use-refresh"

let serverVersion: string | null = null
let reloading = false

/** Versione nuova sul server: si ricarica la pagina, ma non mentre una finestra è aperta (si perderebbe quello che si sta
 *  scrivendo): appena si chiude. */
function reloadForNewVersion(): void {
  if (reloading) return
  reloading = true
  const go = () => {
    toast("SApp aggiornato: ricarico…")
    setTimeout(() => location.reload(), 600)
  }
  if (!overlayOpen()) return go()
  toast("SApp aggiornato: ricarico appena chiudi la finestra")
  const wait = window.setInterval(() => {
    if (!overlayOpen()) {
      clearInterval(wait)
      go()
    }
  }, 500)
}

/** Aggiornamento dal vivo: il server avvisa quando i dati cambiano (Server-Sent Events).
 *  Si riconnette da solo; non disturba chi sta scrivendo in una finestra; se il server riparte con una versione
 *  nuova la pagina si ricarica da sola. `reload` ricarica i dati di base prima di ridisegnare. */
export function useLive(reload: () => Promise<void>): void {
  useEffect(() => {
    let es: EventSource | null = null
    let timer: number | undefined
    let wait: number | undefined
    let retry = 1000
    let last: string | null = null
    let stopped = false
    const apply = () => {
      clearTimeout(timer)
      timer = window.setTimeout(async () => {
        if (overlayOpen()) {
          // non interrompo chi sta scrivendo: aggiorno quando chiude
          clearInterval(wait)
          wait = window.setInterval(() => {
            if (!overlayOpen()) {
              clearInterval(wait)
              apply()
            }
          }, 500)
          return
        }
        try {
          await reload()
        } catch {
          /* riprovo al prossimo avviso */
        }
        refresh()
      }, 200)
    }
    const connect = () => {
      if (stopped) return
      es?.close()
      const src = new EventSource("/api/live")
      es = src
      src.onopen = () => {
        setOnline(true)
        retry = 1000
      }
      src.addEventListener("version", (e) => {
        const v = (e as MessageEvent<string>).data
        if (serverVersion && serverVersion !== v) return reloadForNewVersion()
        serverVersion = v
      })
      // tornato online: qualcosa può essere cambiato
      src.addEventListener("hello", (e) => {
        const n = (e as MessageEvent<string>).data
        if (last !== null && last !== n) apply()
        last = n
      })
      src.addEventListener("changed", (e) => {
        last = (e as MessageEvent<string>).data
        apply()
      })
      src.onerror = () => {
        setOnline(false)
        src.close()
        es = null
        setTimeout(connect, retry)
        retry = Math.min(retry * 2, 10000)
      }
    }
    connect()
    // controllo della versione anche senza il collegamento dal vivo (il telefono a volte sospende la pagina)
    let lastCheck = 0
    const checkVersion = async () => {
      if (Date.now() - lastCheck < 5000) return
      lastCheck = Date.now()
      try {
        const v = (await (await fetch("/api/version", { cache: "no-store", credentials: "same-origin" })).json()).version as string
        if (v && serverVersion && v !== serverVersion) reloadForNewVersion()
        else if (v && !serverVersion) serverVersion = v
      } catch {
        /* server non raggiungibile: ci pensa il collegamento dal vivo */
      }
    }
    const resumed = () => {
      checkVersion()
      retry = 1000
      if (!es) connect()
    }
    const onVisible = () => {
      if (document.hidden) return
      const wasConnected = !!es
      resumed()
      if (wasConnected) apply()
    }
    const minute = window.setInterval(() => !document.hidden && checkVersion(), 60000)
    window.addEventListener("focus", checkVersion)
    window.addEventListener("pageshow", checkVersion)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      stopped = true
      es?.close()
      clearTimeout(timer)
      clearInterval(wait)
      clearInterval(minute)
      window.removeEventListener("focus", checkVersion)
      window.removeEventListener("pageshow", checkVersion)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [reload])
}
