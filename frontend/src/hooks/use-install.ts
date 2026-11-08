import { useSyncExternalStore } from "react"
import { installState, onInstallChange, type InstallState } from "@/lib/pwa"

/** Si può installare SApp come app? (vedi InstallState) */
export function useInstall(): InstallState {
  return useSyncExternalStore(onInstallChange, installState)
}
