import { StrictMode, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { applyStoredTheme } from "@/lib/theme"
import { setupBackButton } from "@/lib/overlays"
import { setupPwa } from "@/lib/pwa"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ErrorBoundary } from "@/components/error-boundary"
import "@/index.css"

/** Niente zoom da telefono: né con due dita né con il doppio tocco (Safari ignora `user-scalable=no`). */
function noZoom(): void {
  const stop = (e: Event) => e.preventDefault()
  for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, stop, { passive: false })
  document.addEventListener("touchmove", (e) => e.touches.length > 1 && e.preventDefault(), { passive: false })
}

/** Avvio comune a tutte le pagine: tema, web app installabile, tasto Indietro, avvisi in basso; un errore mostra
 *  cosa è successo invece dello schermo vuoto. */
export function boot(page: ReactNode): void {
  applyStoredTheme()
  noZoom()
  setupPwa()
  setupBackButton()
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <TooltipProvider delayDuration={300}>
          {page}
          <Toaster position="bottom-center" />
        </TooltipProvider>
      </ErrorBoundary>
    </StrictMode>,
  )
}
