import { useState, type ReactNode } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

/* Modifiche non salvate in vista (es. Orari): cambiando sezione o chiudendo il pannello si chiede prima; chiudendo o
   ricaricando la pagina lo chiede il browser. */

const dirty = new Set<string>()

/** La sezione `key` ha (o non ha più) modifiche non salvate. */
export function setUnsaved(key: string, on: boolean): void {
  if (on) dirty.add(key)
  else dirty.delete(key)
}

window.addEventListener("beforeunload", (e) => {
  if (dirty.size) e.preventDefault()
})

/** `guard(vai)`: con modifiche non salvate chiede prima di `vai`; `dialog` va messo nella pagina. */
export function useLeaveGuard(): { guard: (go: () => void) => void; dialog: ReactNode } {
  const [pending, setPending] = useState<(() => void) | null>(null)
  const guard = (go: () => void) => {
    if (!dirty.size) return go()
    setPending(() => go)
  }
  const dialog = (
    <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Modifiche non salvate</AlertDialogTitle>
          <AlertDialogDescription>Ci sono modifiche non ancora salvate: uscendo si perdono.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Resta</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => {
              dirty.clear()
              pending?.()
            }}
          >
            Esci senza salvare
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  return { guard, dialog }
}
