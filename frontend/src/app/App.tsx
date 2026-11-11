import { useCallback, useEffect, useMemo, useState } from "react"
import { errorText, get, isOnline, onOnlineChange } from "@/lib/api"
import type { Me } from "@/lib/types"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { useLeaveGuard } from "@/components/leave-guard"
import { useLive } from "@/hooks/use-live"
import { refresh } from "@/hooks/use-refresh"
import { Home } from "@/app/home"
import { SessionContext } from "@/app/session"
import { SettingsView } from "@/app/settings-view"

/** Scorciatoie dell'app installata (/#settings): cosa aprire subito. */
function startWithSettings(): boolean {
  if (location.hash !== "#settings") return false
  history.replaceState(null, "", location.pathname + location.search)
  return true
}

/** Pagina principale: chi è collegato, le sezioni dell'app; Impostazioni si apre dal menu utente in un pannello. */
export function App() {
  const start = useMemo(startWithSettings, [])
  const [me, setMe] = useState<Me | null>(null)
  const [failed, setFailed] = useState("")
  const [open, setOpen] = useState(start)
  const { guard, dialog } = useLeaveGuard()

  const reloadMe = useCallback(async () => {
    setMe(await get<Me>("/api/me"))
  }, [])

  useEffect(() => {
    reloadMe().catch((e) => setFailed(errorText(e)))
  }, [reloadMe])
  // «#settings» anche con la pagina già aperta (scorciatoia dell'app installata, collegamenti)
  useEffect(() => {
    const on = () => startWithSettings() && setOpen(true)
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [])

  // qualcuno ha cambiato qualcosa (anche da un altro dispositivo): si rilegge
  useLive(reloadMe)
  // tornato il server dopo un po' senza: si ricarica tutto (quello che si vedeva era la copia salvata)
  useEffect(() => {
    let was = isOnline()
    return onOnlineChange(() => {
      const now = isOnline()
      if (now && !was) {
        void reloadMe().catch(() => {})
        refresh()
      }
      was = now
    })
  }, [reloadMe])

  if (!me) {
    return <div className="grid min-h-svh place-items-center p-6 text-sm text-muted-foreground">{failed ? <p>{failed}</p> : <Spinner className="size-6" />}</div>
  }

  return (
    <SessionContext.Provider value={{ me, reload: reloadMe }}>
      <Home onSettings={() => guard(() => setOpen(true))} />
      {dialog}
      <Sheet open={open} onOpenChange={(o) => (o ? setOpen(true) : guard(() => setOpen(false)))}>
        <SheetContent
          side="right"
          // da telefono il pannello è largo quanto lo schermo: niente bordo a sinistra
          className="w-full gap-0 p-0 max-sm:border-l-0 sm:max-w-xl"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader className="border-b px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
            <SheetTitle>Impostazioni</SheetTitle>
            <SheetDescription>Account, app Android e web app.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-4">
            <SettingsView />
          </div>
        </SheetContent>
      </Sheet>
    </SessionContext.Provider>
  )
}
