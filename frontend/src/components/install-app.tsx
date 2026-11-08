import { useState } from "react"
import { CheckIcon, DownloadIcon, EllipsisVerticalIcon, ExternalLinkIcon, LockIcon, MonitorDownIcon, ShareIcon, SmartphoneIcon, SquarePlusIcon } from "lucide-react"
import { install, installUrl, isIOS, isMobileDevice, type InstallState } from "@/lib/pwa"
import { APK_URL, phone, useApk } from "@/lib/phone"
import { useInstall } from "@/hooks/use-install"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex items-start gap-3">
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{n}</span>
    <span className="pt-0.5">{children}</span>
  </li>
)

/** Cosa fare per installarla, secondo il dispositivo e come è aperta la pagina. */
function HowTo({ st }: { st: InstallState }) {
  const url = installUrl()
  if (st === "ios")
    return (
      <ol className="grid gap-3 text-sm">
        <Step n={1}>
          Apri SApp in <b>Safari</b> e tocca <ShareIcon className="inline size-4 align-[-3px] text-primary" /> <b>Condividi</b>
        </Step>
        <Step n={2}>
          Scegli <SquarePlusIcon className="inline size-4 align-[-3px] text-primary" /> <b>Aggiungi alla schermata Home</b>
        </Step>
        <Step n={3}>
          Tocca <b>Aggiungi</b>: SApp compare tra le app
        </Step>
      </ol>
    )
  if (st === "insecure")
    return (
      <div className="grid gap-3 text-sm">
        <p className="flex items-start gap-2 text-muted-foreground">
          <LockIcon className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            Da questo indirizzo (senza <b className="text-foreground">https</b>) il browser non permette di installarla. Aprila dall'indirizzo sicuro e installala da lì.
          </span>
        </p>
        {url ? (
          <Button asChild className="w-full">
            <a href={url + "/"}>
              <ExternalLinkIcon /> Apri {url.replace(/^https:\/\//, "")}
            </a>
          </Button>
        ) : (
          <p className="text-muted-foreground">L'indirizzo https (quello da fuori casa) te lo dà l'amministratore.</p>
        )}
      </div>
    )
  if (!isMobileDevice())
    return (
      <div className="grid gap-3 text-sm">
        <ol className="grid gap-3">
          <Step n={1}>
            In <b>Chrome</b> o <b>Edge</b> cerca <MonitorDownIcon className="inline size-4 align-[-3px] text-primary" /> nella barra dell'indirizzo, a destra
          </Step>
          <Step n={2}>
            Oppure dal menu <EllipsisVerticalIcon className="inline size-4 align-[-3px] text-primary" /> scegli <b>Installa SApp</b> (in Edge: <b>App</b> → <b>Installa</b>)
          </Step>
          <Step n={3}>Conferma: SApp si apre nella sua finestra, con l'icona nel menu Start o nel Dock</Step>
        </ol>
        <p className="text-muted-foreground">Firefox non installa le web app: usa Chrome o Edge.</p>
      </div>
    )
  return (
    <div className="grid gap-3 text-sm">
      <ol className="grid gap-3">
        <Step n={1}>
          Apri il menu del browser <EllipsisVerticalIcon className="inline size-4 align-[-3px] text-primary" /> (in Chrome in alto a destra)
        </Step>
        <Step n={2}>
          Scegli <b>Installa app</b> (o <b>Aggiungi a schermata Home</b>)
        </Step>
        <Step n={3}>Conferma: SApp compare tra le app, a schermo intero</Step>
      </ol>
      <p className="text-muted-foreground">Se la voce non c'è ancora, usa SApp qualche secondo e riprova: Chrome la propone dopo un po'.</p>
    </div>
  )
}

/** Cosa in più fa l'app Android rispetto alla web app (lo dice ogni app: es. «Le sveglie dei turni suonano da sole»). */
const ANDROID_PITCH = "Entra una volta e resta collegata, si aggiorna dal server, usa le funzioni del telefono."
const WEB_PITCH = "Dal browser, su telefono, tablet o PC: icona tra le app e finestra sua."

const mb = (n?: number) => (n ? ` · ${(n / 1048576).toFixed(1)} MB` : "")

/** Una scelta del riquadro «Installa». */
function Choice({ icon, title, text, badge, children }: { icon: React.ReactNode; title: string; text: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 rounded-xl border p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">{icon}</span>
        <div className="grid min-w-0 gap-0.5">
          <span className="flex items-center gap-2 font-medium">
            {title}
            {badge && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">{badge}</span>}
          </span>
          <span className="text-sm text-muted-foreground">{text}</span>
        </div>
      </div>
      {children}
    </div>
  )
}

/** «Installa»: a scelta l'app Android (l'APK dal server) o la web app (dal browser). L'app Android c'è solo se il
 *  pacchetto del server la contiene. */
export function InstallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const st = useInstall()
  const apk = useApk()
  const [howTo, setHowTo] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const android = !!apk?.available && !isIOS()
  const webDone = st === "installed" || st === "elsewhere"
  // senza app Android non c'è niente da scegliere: subito come si installa la web app
  const showHowTo = howTo || !android
  const close = (o: boolean) => {
    onOpenChange(o)
    if (!o) {
      setHowTo(false)
      setDownloaded(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Installa SApp</DialogTitle>
          <DialogDescription>{showHowTo ? "Si apre come un'app, nella sua finestra, e si aggiorna da sola." : "Scegli come averla su questo dispositivo."}</DialogDescription>
        </DialogHeader>
        {showHowTo ? (
          <HowTo st={st} />
        ) : (
          <div className="grid gap-3">
            {android && (
              <Choice
                icon={<SmartphoneIcon className="size-5" />}
                title="App Android"
                badge={/Android/i.test(navigator.userAgent) ? "consigliata" : undefined}
                text={`${ANDROID_PITCH} Versione ${apk?.version}${mb(apk?.size)}.`}
              >
                <Button asChild>
                  <a href={APK_URL} download={apk?.file_name} onClick={() => setDownloaded(true)}>
                    <DownloadIcon /> Scarica l'app
                  </a>
                </Button>
                {downloaded && (
                  <ol className="grid gap-2 text-sm">
                    <Step n={1}>Apri il file scaricato (dalla notifica o da Download)</Step>
                    <Step n={2}>Android chiede di permettere l'installazione dal browser: consenti e installa</Step>
                    <Step n={3}>Apri SApp ed entra con nome utente e password</Step>
                  </ol>
                )}
              </Choice>
            )}
            <Choice icon={<MonitorDownIcon className="size-5" />} title="Web app" text={WEB_PITCH}>
              {webDone ? (
                <p className="flex items-center gap-2 text-sm text-ok">
                  <CheckIcon className="size-4" /> Già installata su questo dispositivo.
                </p>
              ) : (
                <Button
                  variant={android ? "outline" : "default"}
                  onClick={() => {
                    if (st === "ready") {
                      void install()
                      close(false)
                    } else setHowTo(true)
                  }}
                >
                  <MonitorDownIcon /> Installa la web app
                </Button>
              )}
            </Choice>
          </div>
        )}
        <DialogFooter>
          {howTo && android && (
            <Button variant="ghost" onClick={() => setHowTo(false)}>
              Indietro
            </Button>
          )}
          <Button variant="outline" onClick={() => close(false)}>
            Chiudi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Pulsante «Installa»: apre la scelta tra app Android e web app. Non c'è dentro l'app, né quando non resta niente
 *  da installare. */
export function InstallButton({ className, label = "Installa" }: { className?: string; label?: string }) {
  const st = useInstall()
  const apk = useApk()
  const [open, setOpen] = useState(false)
  const android = !!apk?.available && !isIOS()
  if (phone || (!android && (st === "installed" || st === "elsewhere"))) return null
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={className}
        // solo web app e il browser la sa installare: subito, senza riquadro
        onClick={() => (!android && st === "ready" ? void install() : setOpen(true))}
      >
        <DownloadIcon /> {label}
      </Button>
      <InstallDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

/** Impostazioni: SApp come app, con lo stato e cosa fare. */
export function InstallCard() {
  const st = useInstall()
  return (
    <Card>
      <CardHeader>
        <CardTitle>App</CardTitle>
        <CardDescription>SApp si installa dal browser, sul telefono e sul PC: icona tra le app, finestra sua, si aggiorna da sola.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {st === "installed" && (
          <p className="flex items-center gap-2 text-sm text-ok">
            <CheckIcon className="size-4" /> Stai usando SApp installata come app.
          </p>
        )}
        {st === "elsewhere" && (
          <p className="flex items-center gap-2 text-sm text-ok">
            <CheckIcon className="size-4" /> SApp è già installata qui: aprila dalla sua icona.
          </p>
        )}
        {st === "ready" && (
          <Button className="w-fit" onClick={() => install()}>
            <DownloadIcon /> Installa SApp
          </Button>
        )}
        {(st === "ios" || st === "insecure" || st === "manual") && <HowTo st={st} />}
      </CardContent>
    </Card>
  )
}
