import { useEffect, useRef, useState, type DependencyList } from "react"
import { errorText } from "@/lib/api"

export interface AsyncState<T> {
  data?: T
  error?: string
  loading: boolean
}

/** Ultimi dati di ogni sezione: tornandoci si vedono subito, mentre arrivano quelli nuovi. */
const cache = new Map<string, unknown>()

/** Carica dei dati quando cambiano le dipendenze; tiene quelli vecchi finché arrivano i nuovi (niente sfarfallio).
 *  `key`: nome con cui ricordare i dati tra un cambio di sezione e l'altro. */
export function useAsync<T>(key: string, fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>(() => ({ data: cache.get(key) as T | undefined, loading: true }))
  const gen = useRef(0)
  useEffect(() => {
    const g = ++gen.current
    setState((s) => ({ ...s, loading: true }))
    fn().then(
      (data) => {
        if (g !== gen.current) return
        cache.set(key, data)
        setState({ data, loading: false })
      },
      (e) => g === gen.current && setState((s) => ({ ...s, error: errorText(e), loading: false })),
    )
  }, deps)
  return state
}

const pending = new Map<string, Promise<void>>()

/** Prepara in sottofondo i dati di una sezione non a schermo (lo swipe la mostra subito piena). Finisce quando sono
 *  pronti (o non arrivano: niente errore). */
export function prefetch<T>(key: string, fn: () => Promise<T>): Promise<void> {
  if (cache.has(key)) return Promise.resolve()
  const busy = pending.get(key)
  if (busy) return busy
  const p = fn().then(
    (d) => void (!cache.has(key) && cache.set(key, d)),
    () => {},
  )
  pending.set(key, p)
  void p.finally(() => pending.delete(key))
  return p
}
