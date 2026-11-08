/* Pannello amministratore: formati di dimensioni, date e durate. */

export const fmtMB = (b: number): string => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB")

/** "23 ott 2026 14:05" */
export const fdt = (s: number | null | undefined): string => {
  if (!s) return "—"
  const d = new Date(s * 1000)
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) + " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
}

/** Quando, in breve: "oggi 14:05", "ieri 9:30", "23 ott 14:05" (con l'anno se non è quest'anno). */
export const fwhen = (s: number | null | undefined): string => {
  if (!s) return "—"
  const d = new Date(s * 1000)
  const now = new Date()
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
  const diff = Math.round((day(now) - day(d)) / 86400000)
  if (diff === 0) return "oggi " + time
  if (diff === 1) return "ieri " + time
  const date = d.toLocaleDateString("it-IT", { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) })
  return date + " " + time
}

/** "2g 3h 5m" */
export function dur(s: number): string {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return (d ? d + "g " : "") + (h ? h + "h " : "") + m + "m"
}
