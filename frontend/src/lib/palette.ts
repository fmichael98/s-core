/* Tavolozza degli utenti: 9 colori di Tailwind, in coppia chiaro/scuro (classi pal-<colore> in index.css). */

import type { CSSProperties } from "react"

export const PALETTE: ReadonlyArray<readonly [key: string, label: string]> = [
  ["rose", "Rosa"],
  ["orange", "Arancio"],
  ["yellow", "Giallo"],
  ["lime", "Lime"],
  ["green", "Verde"],
  ["sky", "Celeste"],
  ["blue", "Blu"],
  ["violet", "Viola"],
  ["fuchsia", "Fucsia"],
]

/** Classe e stile per un elemento col colore dell'utente: usa var(--pal) per il colore pieno, var(--pal-ink) per il testo sopra. */
export function palette(color: string | null | undefined): { className: string; style: CSSProperties } {
  if (color && color[0] === "#") return { className: "", style: { "--pal": color, "--pal-ink": "#fff" } as CSSProperties }
  return { className: color ? "pal-" + color : "", style: {} }
}
