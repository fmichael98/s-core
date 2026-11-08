import { useEffect, useState, useSyncExternalStore } from "react"
import { WifiOffIcon } from "lucide-react"
import { isOnline, onOnlineChange, retryServer, savedSince } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const pad = (n: number) => String(n).padStart(2, "0")

/** «alle 14:32», o «del 23/10 alle 14:32» se non è di oggi. */
function when(ms: number): string {
  const d = new Date(ms)
  const time = `alle ${d.getHours()}:${pad(d.getMinutes())}`
  return d.toDateString() === new Date().toDateString() ? time : `del ${d.getDate()}/${d.getMonth() + 1} ${time}`
}

/** Dopo quanto si dice che il server non risponde (appena aperta l'app spesso si riprende da solo in un attimo). */
const DELAY_MS = 4000

/** Accanto al nome dell'app: il server non risponde da qualche secondo. Si vedono i dati salvati l'ultima volta (solo
 *  da consultare); si riprova da soli, o subito con «Riprova». Non sposta niente nella pagina. */
export function OfflineBadge() {
  const online = useSyncExternalStore(onOnlineChange, isOnline)
  const saved = useSyncExternalStore(onOnlineChange, savedSince)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (online) return setShown(false)
    const t = setTimeout(() => setShown(true), DELAY_MS)
    return () => clearTimeout(t)
  }, [online])
  if (!shown) return null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="status"
          className="inline-flex h-6 shrink-0 animate-in items-center gap-1.5 rounded-full border border-warn/40 bg-warn/10 px-2 text-xs font-medium text-warn duration-300 fade-in outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <WifiOffIcon className="size-3.5" /> offline
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-72 gap-3 text-sm">
        <p>
          <span className="font-medium">Il server non risponde.</span>{" "}
          <span className="text-muted-foreground">
            {saved ? `Vedi i dati salvati ${when(saved)}, solo da consultare.` : "Si può solo consultare."} Si riprova da solo.
          </span>
        </p>
        <Button size="sm" variant="outline" onClick={retryServer}>
          Riprova adesso
        </Button>
      </PopoverContent>
    </Popover>
  )
}
