import { useSyncExternalStore } from "react"

/* Numero che cresce quando i dati sul server cambiano (avviso dal vivo, trascinamento in giù, modifica fatta qui):
   le sezioni lo mettono tra le dipendenze e si ricaricano. */

let tick = 0
const listeners = new Set<() => void>()

export function refresh(): void {
  tick++
  listeners.forEach((l) => l())
}

export function useRefreshTick(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => tick,
  )
}
