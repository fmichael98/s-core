/* Se la pagina si rompe (un errore mentre disegna), invece dello schermo vuoto: cosa è successo e «Ricarica». */

import { Component, type ErrorInfo, type ReactNode } from "react"

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("SApp:", error, info.componentStack)
  }

  render() {
    const e = this.state.error
    if (!e) return this.props.children
    return (
      <div className="grid min-h-svh place-items-center p-6 text-center">
        <div className="grid max-w-sm gap-3">
          <p className="text-lg font-semibold">Qualcosa non è andato</p>
          <p className="text-sm text-muted-foreground">
            La pagina si è fermata per un errore. Ricaricala; se succede ancora, manda a chi gestisce SApp il testo qui sotto.
          </p>
          <pre className="max-h-40 overflow-auto rounded-md bg-muted px-3 py-2 text-left text-xs whitespace-pre-wrap">{String(e.message || e)}</pre>
          <button type="button" className="mx-auto h-11 rounded-xl bg-primary px-6 font-semibold text-primary-foreground" onClick={() => location.reload()}>
            Ricarica
          </button>
        </div>
      </div>
    )
  }
}
