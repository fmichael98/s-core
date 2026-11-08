import { useSyncExternalStore } from "react"
import { isOnline, onOnlineChange } from "@/lib/api"
import { cn } from "@/lib/utils"

/** Pallino del collegamento con la versione (solo amministratori): verde, rosso "disconnesso". */
export function LiveDot({ version, className }: { version?: string; className?: string }) {
  const online = useSyncExternalStore(onOnlineChange, isOnline)
  // senza versione (chi non è amministratore) niente: il server che non risponde lo dice il segnale accanto al nome
  if (!version) return null
  return (
    <div className={cn("hidden items-center gap-2 text-xs text-muted-foreground sm:flex", className)}>
      <span className={cn("size-2 rounded-full", online ? "bg-ok" : "bg-destructive")} />
      {online ? "v" + version : "disconnesso"}
    </div>
  )
}
