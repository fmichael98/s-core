import { useEffect, useState } from "react"
import { GlobeIcon, RotateCwIcon, TriangleAlertIcon } from "lucide-react"
import { api, errorText, get } from "@/lib/api"
import type { ConfigItem, ConfigView, UpdateStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

type Msg = { text: string; tone?: "ok" | "bad" }

/** Avvio attuale del server (cambia quando riparte). */
const bootNow = () =>
  fetch("/api/version", { cache: "no-store" })
    .then((r) => r.json())
    .then((v) => v.boot as number | undefined)
    .catch(() => undefined)

/** Attende che il servizio si riavvii (nuovo "boot", rispetto a `boot0` letto prima di salvare) e ricarica; se cambia
 *  la porta di casa e la pagina è aperta da lì, apre l'indirizzo nuovo appena risponde. */
async function waitRestart(say: (m: Msg) => void, boot0: number | undefined, target: string | null): Promise<void> {
  const t0 = Date.now()
  if (target) {
    say({ text: "La porta cambia: apro " + target + " appena risponde…", tone: "ok" })
    const probe = async () => {
      try {
        // un'altra porta è un altro sito: basta sapere che risponde
        await fetch(target.replace(/\/admin#config$/, "/api/version"), { mode: "no-cors", cache: "no-store" })
        location.href = target
        return
      } catch {
        /* non ancora */
      }
      if (Date.now() - t0 < 90000) setTimeout(probe, 1500)
      else say({ text: "La porta nuova non risponde: se la configurazione non è partita è tornata quella di prima. Ricarica la pagina.", tone: "bad" })
    }
    setTimeout(probe, 3000)
    return
  }
  const poll = async () => {
    try {
      const s: UpdateStatus | null = await fetch("/api/update/status", { cache: "no-store", credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null))
      if (s && s.result && !s.pending && /^rollback|^err/.test(s.result)) return say({ text: "Non applicata: " + s.result, tone: "bad" })
      const v = await fetch("/api/version", { cache: "no-store" }).then((r) => r.json())
      if (v.boot !== boot0) {
        say({ text: "Fatto ✓", tone: "ok" })
        setTimeout(() => location.reload(), 900)
        return
      }
    } catch {
      /* si sta riavviando */
    }
    if (Date.now() - t0 < 90000) setTimeout(poll, 1500)
    else say({ text: "Non risponde ancora: ricarica la pagina tra poco.", tone: "bad" })
  }
  setTimeout(poll, 2000)
}

function ConfigField({ it, value, onChange }: { it: ConfigItem; value: string; onChange: (v: string) => void }) {
  const ro = it.kind === "ro"
  const full = it.kind === "host" || it.kind === "addr" || ro || (it.help || "").length > 70
  return (
    <Field className={cn(full && "sm:col-span-2")}>
      <FieldLabel htmlFor={"cfg-" + it.key}>{it.label}</FieldLabel>
      <Input
        id={"cfg-" + it.key}
        value={value}
        readOnly={ro}
        disabled={ro}
        onChange={(e) => onChange(e.target.value)}
        inputMode={it.kind === "int" ? "numeric" : undefined}
        autoCapitalize="none"
        spellCheck={false}
      />
      {it.help && <FieldDescription>{it.help}</FieldDescription>}
      {it.value !== it.running && <FieldDescription className="text-warn">in uso ora: {it.running} (si applica al riavvio)</FieldDescription>}
    </Field>
  )
}

/** Amministrazione → Configurazione: porta, indirizzo pubblico, sicurezza. Salvando SApp si riavvia. */
export function ConfigSection() {
  const [cfg, setCfg] = useState<ConfigView | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [err, setErr] = useState("")
  const [pw, setPw] = useState("")
  const [msg, setMsg] = useState<Msg | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    get<ConfigView>("/api/admin/config").then(
      (r) => {
        setCfg(r)
        setValues(Object.fromEntries(r.items.map((i) => [i.key, i.value])))
      },
      (e) => setErr(errorText(e)),
    )
  }, [])

  if (!cfg) return err ? <p className="py-10 text-center text-sm text-muted-foreground">{err}</p> : <Spinner className="mx-auto my-16 size-6" />

  const groups: Record<string, ConfigItem[]> = {}
  cfg.items.forEach((it) => (groups[it.group] ??= []).push(it))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const out: Record<string, string> = {}
    cfg.items.forEach((i) => {
      if (i.kind !== "ro") out[i.key] = (values[i.key] ?? "").trim()
    })
    setMsg({ text: "Salvataggio…" })
    setBusy(true)
    try {
      // prima di salvare: così si riconosce il riavvio anche se è velocissimo
      const boot0 = await bootNow()
      const j = await api<{ changed: number; new_port?: number | null }>("POST", "/api/admin/config", { values: out, password: pw })
      if (!j.changed) {
        setMsg({ text: "Nessuna modifica." })
        setBusy(false)
        return
      }
      setMsg({ text: "Applico la configurazione e riavvio…", tone: "ok" })
      // porta di casa cambiata: ci si sposta solo se la pagina è aperta proprio da lì (da fuori, con Caddy, l'indirizzo
      // resta quello)
      const lanPort = cfg.items.find((i) => i.key === "bind")?.running.split(":").pop()
      const fromLan = location.protocol === "http:" && location.port === lanPort
      const target = j.new_port && fromLan ? `http://${location.hostname}:${j.new_port}/admin#config` : null
      await waitRestart(setMsg, boot0, target)
    } catch (er) {
      setMsg({ text: errorText(er), tone: "bad" })
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="mx-auto grid max-w-3xl gap-4">
      {!cfg.helper && (
        <Alert className="border-warn/50 text-warn">
          <TriangleAlertIcon />
          <AlertTitle>Aggiornatore di sistema non installato</AlertTitle>
          <AlertDescription>
            <p>
              Per salvare la configurazione dal web serve una volta, da SSH, <code className="rounded bg-muted px-1 font-mono text-foreground">sudo ./install.sh</code>.
            </p>
          </AlertDescription>
        </Alert>
      )}
      {cfg.public_url && (
        <Alert>
          <GlobeIcon />
          <AlertTitle className="font-mono">{cfg.public_url}</AlertTitle>
          <AlertDescription>Da fuori casa (app e browser)</AlertDescription>
        </Alert>
      )}
      {Object.entries(groups).map(([g, list]) => (
        <Card key={g}>
          <CardHeader>
            <CardTitle>{g}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {list.map((it) => (
              <ConfigField key={it.key} it={it} value={values[it.key] ?? ""} onChange={(v) => setValues((s) => ({ ...s, [it.key]: v }))} />
            ))}
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle>Salva</CardTitle>
          <CardDescription>
            File: <code className="font-mono">{cfg.file}</code>. Al salvataggio: copia di sicurezza, aggiornamento di Caddy e riavvio (qualche secondo). Se SApp non
            riparte torna da solo alla configurazione precedente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field className="sm:max-w-xs">
            <FieldLabel htmlFor="cfg-pw">La tua password (conferma)</FieldLabel>
            <Input id="cfg-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-3">
          <p className={cn("text-sm text-muted-foreground", msg?.tone === "ok" && "text-ok", msg?.tone === "bad" && "text-destructive")}>{msg?.text}</p>
          <Button type="submit" disabled={!cfg.helper || busy}>
            {busy ? <Spinner /> : <RotateCwIcon />} Salva e riavvia SApp
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
