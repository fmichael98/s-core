/* Chiamate al server: intestazione anti-CSRF, sessione scaduta, server che si riavvia o non risponde, indicatore di
   collegamento. Senza server il service worker risponde con l'ultima copia dei dati (solo da consultare). */

/** Intestazione che il server vuole in ogni richiesta che modifica qualcosa (come CSRF_HEADER nel server: col nome
 *  breve, così nuova-app.py la cambia uguale nei due posti anche quando il nome breve è diverso dal nome). */
const CSRF = "x-sapp"

// ---------------------------------------------------------------- stato del collegamento (pallino in alto)

let online = true
/** Senza server: da quando sono i dati più vecchi che si vedono (copie salvate), in ms. */
let savedAt: number | null = null
const liveListeners = new Set<() => void>()
export const isOnline = () => online
export const savedSince = () => savedAt
export function onOnlineChange(l: () => void): () => void {
  liveListeners.add(l)
  return () => liveListeners.delete(l)
}
export function setOnline(ok: boolean): void {
  if (ok === online) return
  online = ok
  if (ok) savedAt = null
  else serverLost()
  liveListeners.forEach((l) => l())
}
/** Arrivata una copia salvata (senza server): `at` quando era stata salvata. */
function fromSaved(at: number): void {
  const was = savedAt
  if (at > 0 && (savedAt === null || at < savedAt)) savedAt = at
  if (online) setOnline(false)
  else if (was !== savedAt) liveListeners.forEach((l) => l())
}

/** Nome della copia dei dati nel service worker (vedi public/sw.js). */
const SAVED = "sapp-dati-v1"
/** Uscendo: via le copie dei dati salvate per consultarle senza connessione. */
export async function forgetSaved(): Promise<void> {
  try {
    if ("caches" in window) await caches.delete(SAVED)
  } catch {
    /* niente da cancellare */
  }
}

/** Server che non risponde: aspettare che torni (pagina principale) invece di arrendersi subito. */
let waitForServer = false
export function waitForServerRestarts(): void {
  waitForServer = true
}

let apiFails = 0
let lostTimer: number | null = null

/** Il server non risponde (si sta riavviando, è spento, manca la rete): provo finché torna, all'inizio spesso (un
 *  riavvio dura poco), poi ogni 10 secondi. Intanto in alto c'è "senza connessione". */
function serverLost(): void {
  if (!waitForServer || lostTimer) return
  const t0 = Date.now()
  const probe = async () => {
    try {
      const r = await fetch("/api/version", { cache: "no-store", credentials: "same-origin" })
      if (r.ok) {
        lostTimer = null
        apiFails = 0
        setOnline(true)
        return
      }
    } catch {
      /* ancora giù */
    }
    lostTimer = window.setTimeout(probe, Date.now() - t0 < 45000 ? 1500 : 10000)
  }
  lostTimer = window.setTimeout(probe, 1500)
}
/** Un errore solo: tra poco controllo se il server c'è (se no, "senza connessione"). */
function retrySoon(): void {
  window.setTimeout(async () => {
    try {
      const r = await fetch("/api/version", { cache: "no-store", credentials: "same-origin" })
      if (r.ok) return void (apiFails = 0)
    } catch {
      /* giù */
    }
    setOnline(false)
  }, 1500)
}
/** Riprova subito (pulsante «Riprova» o rete tornata). */
export function retryServer(): void {
  if (lostTimer) window.clearTimeout(lostTimer)
  lostTimer = null
  if (!online) serverLost()
}

/** Chiamata al server; ritorna il JSON della risposta o lancia un errore col messaggio del server. */
export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined ? { [CSRF]: "1", "Content-Type": "application/json" } : { [CSRF]: "1" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    })
  } catch {
    // un solo errore (rete che cambia, app appena tornata in primo piano) non basta
    if (++apiFails >= 2) setOnline(false)
    else retrySoon()
    throw new Error("Server non raggiungibile")
  }
  // senza server: l'ultima copia salvata (solo da consultare)
  const saved = res.headers.get("X-SApp-Offline")
  if (saved !== null) {
    fromSaved(+saved)
    return (await res.json()) as T
  }
  apiFails = 0
  if (res.status === 401) {
    location.href = "/login"
    throw new Error("sessione scaduta")
  }
  let j: (T & { ok?: boolean; error?: string }) | null = null
  try {
    j = await res.json()
  } catch {
    /* risposta senza JSON */
  }
  // proxy davanti al server che si riavvia o è spento (senza la risposta di SApp: un servizio esterno che non
  // risponde è un errore di SApp, col suo messaggio, e il server c'è)
  if ((res.status === 502 || res.status === 503 || res.status === 504) && !(j && j.ok === false && j.error)) {
    setOnline(false)
    throw new Error("Server non raggiungibile")
  }
  setOnline(true)
  if (!res.ok || (j && j.ok === false)) throw new Error((j && j.error) || "errore " + res.status)
  return j as T
}

export const get = <T>(path: string): Promise<T> => api<T>("GET", path)

/** Caricamento di un file con avanzamento (campo "file" del modulo). */
export function upload<T>(url: string, file: File, onProgress: (pct: number) => void): Promise<{ ok: boolean; body: T & { error?: string } }> {
  return new Promise((resolve) => {
    const fd = new FormData()
    fd.append("file", file)
    const x = new XMLHttpRequest()
    x.open("POST", url)
    x.setRequestHeader(CSRF, "1")
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100)
    }
    x.onload = () => {
      let j = {} as T & { ok?: boolean; error?: string }
      try {
        j = JSON.parse(x.responseText)
      } catch {
        /* risposta senza JSON */
      }
      resolve({ ok: x.status < 300 && j.ok !== false, body: j })
    }
    x.onerror = () => resolve({ ok: false, body: { error: "caricamento non riuscito" } as T & { error?: string } })
    x.send(fd)
  })
}

/** Messaggio di un errore qualsiasi. */
export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Manda un modulo (più campi e file) con avanzamento; errore col messaggio del server. */
export function sendForm<T = unknown>(url: string, form: FormData, onProgress?: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open("POST", url)
    x.setRequestHeader(CSRF, "1")
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.((e.loaded / e.total) * 100)
    }
    x.onload = () => {
      let j = {} as T & { ok?: boolean; error?: string }
      try {
        j = JSON.parse(x.responseText)
      } catch {
        /* risposta senza JSON */
      }
      if (x.status === 413) return reject(new Error("File troppo grande"))
      if (x.status >= 300 || j.ok === false) return reject(new Error(j.error || "errore " + x.status))
      resolve(j)
    }
    x.onerror = () => reject(new Error("Caricamento non riuscito"))
    x.send(form)
  })
}

