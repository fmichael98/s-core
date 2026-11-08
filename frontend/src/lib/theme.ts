/* Tema chiaro / scuro, ricordato su questo dispositivo (classe "dark" su <html>, come vuole shadcn/ui). */

export type Theme = "dark" | "light"

const KEY = "theme"
const BAR: Record<Theme, string> = { dark: "#0a0a0a", light: "#ffffff" }
const listeners = new Set<() => void>()

export const currentTheme = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light")

function apply(t: Theme): void {
  document.documentElement.classList.toggle("dark", t === "dark")
  document.documentElement.style.colorScheme = t
  const m = document.querySelector<HTMLMetaElement>("meta[name=theme-color]")
  if (m) m.content = BAR[t]
  listeners.forEach((l) => l())
}

/** Applica il tema salvato (di partenza scuro). */
export function applyStoredTheme(): void {
  let t: Theme = "dark"
  try {
    if (localStorage.getItem(KEY) === "light") t = "light"
  } catch {
    /* memoria del browser non disponibile */
  }
  apply(t)
}

export function setTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* vale solo per questa pagina */
  }
  apply(t)
}

export function onThemeChange(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
