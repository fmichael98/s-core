import { useEffect, useRef, useState, type ReactNode } from "react"
import { PackageIcon, ServerIcon, UploadIcon, XIcon } from "lucide-react"
import { api, errorText, get, upload } from "@/lib/api"
import type { UpdateStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"

type Msg = { text: string; tone?: "ok" | "bad" }

/** Riquadro dove trascinare (o scegliere) un file. */
function DropZone({ accept, onFile, disabled, children }: { accept: string; onFile: (f: File) => void; disabled?: boolean; children: ReactNode }) {
  const [over, setOver] = useState(false)
  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:bg-accent/40",
        over && "border-primary bg-primary/10",
        disabled && "pointer-events-none opacity-50",
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files[0]
        if (f) onFile(f)
      }}
    >
      <UploadIcon className="size-6" />
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (f) onFile(f)
        }}
      />
      <div>{children}</div>
    </label>
  )
}

const Message = ({ m }: { m: Msg | null }) =>
  m ? <p className={cn("text-sm text-muted-foreground", m.tone === "ok" && "text-ok", m.tone === "bad" && "text-destructive")}>{m.text}</p> : null

/** `a` è una versione più nuova di `b` ("2.57.0" > "2.56.3"). Come il server. */
const newerThan = (a: string, b: string) => {
  const n = (v: string) => v.split(".").map(Number)
  const [x, y] = [n(a), n(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}

/** Amministrazione → Aggiornamenti: zip del server da installare. */
export function UpdateSection({ version }: { version: string }) {
  const [st, setSt] = useState<UpdateStatus | null>(null)
  const [err, setErr] = useState("")
  const [staged, setStaged] = useState<string | null>(null)
  // la versione caricata è più vecchia di quella installata (o la stessa): si installa solo dopo averlo letto
  const [older, setOlder] = useState(false)
  const [pct, setPct] = useState<number | null>(null)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [installing, setInstalling] = useState(false)
  const [log, setLog] = useState<string | null>(null)
  const logRef = useRef<HTMLPreElement>(null)

  const load = async () => {
    try {
      const s = await get<UpdateStatus>("/api/update/status")
      setSt(s)
      setStaged(s.staged)
      if (s.staged) setOlder(!newerThan(s.staged, s.current))
      setMsg(s.pending ? { text: "Installazione in corso…" } : s.result ? { text: "Ultimo esito: " + s.result } : null)
    } catch (e) {
      setErr(errorText(e))
    }
  }
  useEffect(() => {
    load()
  }, [])
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 1e9
  }, [log])

  if (!st) return err ? <p className="py-10 text-center text-sm text-muted-foreground">{err}</p> : <Spinner className="mx-auto my-16 size-6" />

  const uploadZip = async (f: File) => {
    setMsg({ text: "Caricamento e controllo…" })
    setPct(0)
    const { ok, body } = await upload<{ version: string; current: string; signed: boolean; older: boolean }>("/api/update/upload", f, setPct)
    setPct(null)
    if (!ok) return setMsg({ text: body.error || "errore", tone: "bad" })
    setStaged(body.version)
    setOlder(body.older)
    const firma = body.signed ? " Firma di GitHub Actions controllata." : ""
    if (body.older)
      return setMsg({
        text: `Attenzione: la ${body.version} non è più nuova di quella installata (${body.current}). Installala solo se vuoi davvero tornare indietro.${firma}`,
        tone: "bad",
      })
    setMsg({ text: `Pronta la versione ${body.version} (ora: ${body.current}).${firma} Premi Installa: SApp si riavvia in pochi secondi.`, tone: "ok" })
  }

  /** Segue l'installazione: registro dal vivo, poi ricarica quando il server è ripartito. */
  const follow = () => {
    let logLen = 0
    setLog("")
    const t0 = Date.now()
    const poll = async () => {
      try {
        const s: UpdateStatus | null = await fetch("/api/update/status?from=" + logLen, { cache: "no-store", credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null))
        if (s) {
          if (s.log) setLog((l) => (l ?? "") + s.log)
          logLen = s.log_len || 0
          if (s.result && !s.pending) {
            const ok = /^ok/.test(s.result)
            setMsg({ text: ok ? "Aggiornato ✓" : s.result, tone: ok ? "ok" : "bad" })
            if (ok) setTimeout(() => location.reload(), 1500)
            else setInstalling(false)
            return
          }
        }
        const v = await fetch("/api/version", { cache: "no-store" }).then((r) => r.json())
        if (v.version !== version && !s) {
          setMsg({ text: "Aggiornato alla " + v.version + " ✓", tone: "ok" })
          setTimeout(() => location.reload(), 1500)
          return
        }
      } catch {
        setMsg({ text: "Riavvio in corso…" })
      }
      if (Date.now() - t0 < 180000) setTimeout(poll, 1500)
      else setMsg({ text: "Non risponde ancora: ricarica la pagina tra poco.", tone: "bad" })
    }
    setTimeout(poll, 1500)
  }

  const install = async () => {
    setInstalling(true)
    try {
      await api("POST", "/api/update/apply")
    } catch (e) {
      setInstalling(false)
      return setMsg({ text: errorText(e), tone: "bad" })
    }
    setMsg({ text: "Installazione in corso…" })
    follow()
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ServerIcon className="size-4" /> Server SApp
          </CardTitle>
          <CardDescription>
            Lo zip si scarica dalla scheda <b>Releases</b> del repository s-app. Prima di installare viene fatta una copia del database; se la nuova versione non parte,
            torna da sola alla precedente.{" "}
            {st.signing ? "Si installano solo zip firmati da GitHub Actions." : "Firma dei pacchetti non ancora attiva (vedi INSTALLAZIONE.md)."}
          </CardDescription>
          <CardAction>
            <Badge variant="secondary" className="font-mono">
              {st.current}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3">
          {!st.available ? (
            <p className="text-sm text-muted-foreground">
              Aggiornamento da web non installato: lancia <code className="rounded bg-muted px-1 font-mono">sudo ./install.sh</code> una volta da SSH.
            </p>
          ) : (
            <>
              <DropZone accept=".zip" onFile={uploadZip} disabled={installing || pct !== null}>
                {staged ? (
                  <>
                    Pronta la versione <b className="text-foreground">{staged}</b>
                  </>
                ) : (
                  <>
                    Trascina qui <b className="text-foreground">sapp-vX.Y.Z.zip</b>
                    <br />
                    oppure clicca per sceglierlo
                  </>
                )}
              </DropZone>
              {pct !== null && <Progress value={pct} />}
              <Message m={msg} />
              {log !== null && (
                <pre ref={logRef} className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
                  {log}
                </pre>
              )}
            </>
          )}
        </CardContent>
        {st.available && (
          <CardFooter className="justify-end gap-2">
            {staged && !installing && (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await api("POST", "/api/update/cancel")
                    setLog(null)
                    setOlder(false)
                    setMsg(null)
                    load()
                  } catch (e) {
                    setMsg({ text: errorText(e), tone: "bad" })
                  }
                }}
              >
                <XIcon /> Annulla
              </Button>
            )}
            <Button disabled={!staged || st.pending || installing} onClick={install}>
              {installing ? <Spinner /> : <PackageIcon />} {older ? "Installa lo stesso" : "Installa"}
            </Button>
          </CardFooter>
        )}
      </Card>

    </div>
  )
}
