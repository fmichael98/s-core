import { useSyncExternalStore } from "react"

/** Telefono: schermo touch piccolo (anche girato in orizzontale). */
export const PHONE = "(pointer: coarse) and (max-width: 767px), (pointer: coarse) and (max-height: 500px)"
/** Schermo in verticale. */
export const PORTRAIT = "(orientation: portrait)"

/** Vale la media query `q` (si aggiorna quando cambia, es. girando il telefono). */
export function useMedia(q: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(q)
      m.addEventListener("change", cb)
      return () => m.removeEventListener("change", cb)
    },
    () => window.matchMedia(q).matches,
  )
}
