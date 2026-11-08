import { useEffect, useState } from "react"
import { CloudDownloadIcon, ServerCogIcon, SlidersHorizontalIcon, UsersIcon } from "lucide-react"
import { errorText, get, setOnline } from "@/lib/api"
import type { Me, SystemInfo } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Brand } from "@/components/brand"
import { LiveDot } from "@/components/live-dot"
import { useLeaveGuard } from "@/components/leave-guard"
import { UserMenu } from "@/components/user-menu"
import { ConfigSection } from "@/admin/config-section"
import { SystemSection } from "@/admin/system-section"
import { UpdateSection } from "@/admin/update-section"
import { UsersSection } from "@/admin/users-section"

type Section = "users" | "config" | "update" | "system"
const SECTIONS: [Section, string, typeof UsersIcon][] = [
  ["users", "Utenti", UsersIcon],
  ["config", "Configurazione", SlidersHorizontalIcon],
  ["update", "Aggiornamenti", CloudDownloadIcon],
  ["system", "Sistema", ServerCogIcon],
]

const fromHash = (): Section => {
  const v = location.hash.slice(1) as Section
  return SECTIONS.some(([k]) => k === v) ? v : "users"
}

/** Pannello dell'amministratore: utenti, configurazione, aggiornamenti, sistema (l'amministratore non usa l'app). */
export function AdminApp() {
  const [me, setMe] = useState<Me | null>(null)
  const [sys, setSys] = useState<SystemInfo | null>(null)
  const [failed, setFailed] = useState("")
  const [section, setSection] = useState<Section>(fromHash)
  const { guard, dialog } = useLeaveGuard()

  useEffect(() => {
    ;(async () => {
      try {
        setMe(await get<Me>("/api/me"))
        setSys(await get<SystemInfo>("/api/admin/system"))
        setOnline(true)
      } catch (e) {
        setFailed(errorText(e))
      }
    })()
    const on = () => setSection(fromHash())
    window.addEventListener("hashchange", on)
    const t = setInterval(
      () =>
        fetch("/api/version", { cache: "no-store" })
          .then(() => setOnline(true))
          .catch(() => setOnline(false)),
      30000,
    )
    return () => {
      window.removeEventListener("hashchange", on)
      clearInterval(t)
    }
  }, [])

  if (!me || !sys)
    return <div className="grid min-h-svh place-items-center p-6 text-sm text-muted-foreground">{failed ? <p>{failed}</p> : <Spinner className="size-6" />}</div>

  const go = (v: string) =>
    guard(() => {
      if (location.hash !== "#" + v) location.replace("#" + v)
      setSection(v as Section)
    })
  // le schede stanno nell'intestazione solo se c'è posto: altrimenti vanno nella riga sotto
  const tabs = (full?: boolean) => (
    <Tabs value={section} onValueChange={go} className={full ? "border-t lg:hidden" : "hidden lg:ml-4 lg:flex"}>
      <TabsList variant="line" className={full ? "mx-auto h-11 w-full max-w-6xl justify-start overflow-x-auto rounded-none px-2" : "h-14"}>
        {SECTIONS.map(([k, label, Icon]) => (
          <TabsTrigger key={k} value={k} className="flex-none gap-2 px-3 data-[state=active]:text-primary data-[state=active]:after:bg-primary">
            <Icon />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )

  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Brand />
          <Badge variant="outline" className="border-primary/40 text-primary">
            amministrazione
          </Badge>
          {tabs()}
          <div className="flex-1" />
          <LiveDot version={sys.version} />
          <UserMenu name={me.name} color={me.color} subtitle={`${me.username} · amministratore`} />
        </div>
        {tabs(true)}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {section === "users" && <UsersSection me={me} />}
        {section === "config" && <ConfigSection />}
        {section === "update" && <UpdateSection version={sys.version} />}
        {section === "system" && <SystemSection />}
      </main>
      {dialog}
    </>
  )
}
