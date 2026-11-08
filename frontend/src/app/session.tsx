import { createContext, useContext } from "react"
import type { Me } from "@/lib/types"

/** Chi è collegato, per tutta la pagina principale; `reload` lo rilegge dal server. */
export const SessionContext = createContext<{ me: Me; reload: () => Promise<void> } | null>(null)

export function useSession(): { me: Me; reload: () => Promise<void> } {
  const s = useContext(SessionContext)
  if (!s) throw new Error("useSession fuori da SessionContext")
  return s
}
