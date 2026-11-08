import { useSyncExternalStore } from "react"
import { currentTheme, onThemeChange, type Theme } from "@/lib/theme"

/** Tema attuale (si aggiorna quando cambia). */
export function useTheme(): Theme {
  return useSyncExternalStore(onThemeChange, currentTheme)
}
