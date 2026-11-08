/* App Android: scaricarla (l'APK arriva col pacchetto del server), come installarla, i telefoni collegati. */

import { BellRingIcon, DownloadIcon, SmartphoneIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { api, errorText, get } from "@/lib/api"
import { phone } from "@/lib/phone"
import type { ApkInfo, Device } from "@/lib/types"
import { useAsync } from "@/hooks/use-async"
import { refresh, useRefreshTick } from "@/hooks/use-refresh"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const ago = (secs: number) => {
  const d = Math.floor((Date.now() / 1000 - secs) / 60)
  if (d < 2) return "adesso"
  if (d < 60) return `${d} minuti fa`
  if (d < 60 * 24) return `${Math.floor(d / 60)} ore fa`
  return new Date(secs * 1000).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })
}

export function AndroidCard() {
  const tick = useRefreshTick()
  const { data } = useAsync("devices", () => get<{ devices: Device[]; app: ApkInfo }>("/api/devices"), [tick])
  const remove = async (d: Device) => {
    try {
      await api("DELETE", `/api/devices/${d.id}`)
      refresh()
      toast.success(`${d.name} scollegato`)
    } catch (e) {
      toast.error(errorText(e))
    }
  }
  const app = data?.app
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SmartphoneIcon className="size-5" /> App Android
        </CardTitle>
        <CardDescription>
          L'app sul telefono: entra una volta e resta collegata, si aggiorna dal server e fa quello che il browser non può (es. sveglie, widget, notifiche).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {phone ? (
          <div className="grid gap-2">
            <Button className="justify-self-start" onClick={() => phone?.openPhone()}>
              <BellRingIcon /> Impostazioni di questo telefono
            </Button>
            <p className="text-sm text-muted-foreground">Permessi, funzioni del telefono e aggiornamento dell'app {phone.version()}.</p>
          </div>
        ) : app?.available ? (
          <div className="grid gap-2">
            <Button asChild className="justify-self-start">
              <a href="/app/sapp.apk" download={app.file_name}>
                <DownloadIcon /> Scarica l'app {app.version}
                {app.size ? <span className="opacity-70">({(app.size / 1048576).toFixed(1)} MB)</span> : null}
              </a>
            </Button>
            <ol className="ml-5 list-decimal text-sm text-muted-foreground">
              <li>Scaricala dal telefono e aprila: Android chiede di permettere l'installazione dal browser.</li>
              <li>Nell'app scrivi l'indirizzo di SApp, il tuo nome utente e la password.</li>
              <li>Dai i permessi che chiede (es. notifiche).</li>
            </ol>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">L'app non è ancora su questo server: arriva col prossimo aggiornamento di SApp.</p>
        )}
        {data && data.devices.length > 0 && (
          <div className="grid gap-2">
            <p className="text-sm font-medium">Telefoni collegati</p>
            {data.devices.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <SmartphoneIcon className="size-4 text-muted-foreground" />
                <div className="grid min-w-0 flex-1">
                  <span className="truncate text-sm font-medium">{d.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    ultima volta {ago(d.last_seen)}
                    {d.agent.match(/SApp-Android\/[\d.]+/) ? ` · app ${d.agent.match(/SApp-Android\/([\d.]+)/)?.[1]}` : ""}
                  </span>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => void remove(d)} aria-label={`Scollega ${d.name}`}>
                  <Trash2Icon />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
