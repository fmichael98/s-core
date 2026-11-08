import { useLayoutEffect, useState, type DependencyList, type RefObject } from "react"

/** Altezza perché l'elemento arrivi esattamente in fondo allo schermo (sotto la barra in alto, sopra il margine della
 *  pagina): la pagina non scorre, scorre solo quello che c'è dentro. */
export function useFitHeight(ref: RefObject<HTMLElement | null>, deps: DependencyList): number | null {
  const [height, setHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY
      const main = el.closest("main")
      const bottom = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0
      setHeight(Math.max(320, Math.floor(window.innerHeight - Math.ceil(top) - bottom)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    const header = document.querySelector("header")
    if (header) ro.observe(header)
    window.addEventListener("resize", fit)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", fit)
    }
  }, deps)
  return height
}
