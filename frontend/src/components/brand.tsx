import { cn } from "@/lib/utils"

/** Nome dell'app: «S» + il nome nel colore dell'app (es. S·Garage, S·Calendar). L'icona è solo quella della web app
 *  e della scheda del browser, non nelle pagine. */
const BRAND = "App"

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("text-lg font-semibold tracking-tight", className)}>
      S<span className="text-primary">{BRAND}</span>
    </span>
  )
}
