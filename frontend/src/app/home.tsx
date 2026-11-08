/* Pagina principale di esempio: come è fatta un'app della famiglia.
   - in alto: titolo della sezione (grande), stato della rete, «Installa», menu utente (con «Aggiorna app» quando serve)
   - in mezzo: il contenuto della sezione (gesti: scorri = sezione accanto, trascina in giù = aggiorna)
   - in basso (telefono): l'isola con le sezioni e il + in mezzo; da PC le sezioni stanno in alto
   Le sezioni vere dell'app prendono il posto di quelle di esempio. */

import { useEffect, useState } from "react"
import { DownloadIcon, HomeIcon, InboxIcon, ListIcon, PlusIcon, SettingsIcon, SmartphoneIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { phone, updateApp, useAppUpdate } from "@/lib/phone"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Brand } from "@/components/brand"
import { Gestures } from "@/components/gestures"
import { InstallButton, InstallDialog } from "@/components/install-app"
import { Island, type IslandItem } from "@/components/island"
import { OfflineBadge } from "@/components/offline-bar"
import { UserMenu } from "@/components/user-menu"
import { useMedia } from "@/hooks/use-media"
import { refresh } from "@/hooks/use-refresh"
import { useSession } from "@/app/session"

type Section = "inizio" | "elenco" | "attivita" | "altro"

const SECTIONS: { key: Section; label: string; icon: IslandItem["icon"] }[] = [
  { key: "inizio", label: "Inizio", icon: HomeIcon },
  { key: "elenco", label: "Elenco", icon: ListIcon },
  { key: "attivita", label: "Attività", icon: InboxIcon },
  { key: "altro", label: "Altro", icon: SparklesIcon },
]
const ORDER = SECTIONS.map((s) => s.key)

/** La sezione nell'indirizzo (#/elenco): Indietro e i preferiti funzionano. */
function fromHash(): Section {
  const h = location.hash.replace(/^#\/?/, "") as Section
  return ORDER.includes(h) ? h : "inizio"
}

export function Home({ onSettings }: { onSettings: () => void }) {
  const { me } = useSession()
  const wide = useMedia("(min-width: 1024px)")
  const smUp = useMedia("(min-width: 640px)")
  const [section, setSection] = useState<Section>(fromHash)
  // scorciatoia dell'app installata (/#nuovo): si apre subito il +
  const [creating, setCreating] = useState(() => {
    if (location.hash !== "#nuovo") return false
    history.replaceState(null, "", location.pathname + location.search)
    return true
  })
  const [installing, setInstalling] = useState(false)
  const update = useAppUpdate()

  useEffect(() => {
    const on = () => setSection(fromHash())
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [])
  const go = (s: string) => {
    if (s === "nuovo") return setCreating(true)
    history.pushState(null, "", `#/${s}`)
    setSection(s as Section)
  }

  const current = SECTIONS.find((s) => s.key === section)!
  const islandItems: IslandItem[] = [
    ...SECTIONS.slice(0, 2).map(({ key, label, icon }) => ({ key, label, icon })),
    { key: "nuovo", label: "Nuovo", icon: PlusIcon, center: true },
    ...SECTIONS.slice(2).map(({ key, label, icon }) => ({ key, label, icon })),
  ]

  return (
    <div className="fixed inset-0 flex flex-col">
      <header className="flex shrink-0 items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-2 lg:border-b lg:px-4 lg:py-2.5">
        <Brand className="mr-3 hidden lg:inline" />
        <h1 className={cn("truncate font-extrabold tracking-[-0.03em]", wide ? "sr-only" : "text-[26px] leading-tight")}>{current.label}</h1>
        <OfflineBadge />
        <div className="flex-1" />
        {wide && (
          <ToggleGroup type="single" variant="outline" size="sm" value={section} onValueChange={(v) => v && go(v)}>
            {SECTIONS.map((s) => (
              <ToggleGroupItem key={s.key} value={s.key}>
                {s.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        {wide && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <PlusIcon /> Nuovo
          </Button>
        )}
        <InstallButton className="max-sm:hidden" />
        <UserMenu
          name={me.name}
          color={me.color}
          subtitle={me.username}
          entries={[
            // app Android vecchia: per prima, col pallino anche sull'avatar
            ...(update ? [{ label: `Aggiorna app ${update}`, icon: <DownloadIcon />, onSelect: updateApp, alert: true }] : []),
            { label: "Impostazioni", icon: <SettingsIcon />, onSelect: onSettings },
            // nell'app: la sua schermata; nel browser del telefono (lì non c'è il pulsante in alto): installa
            ...(phone
              ? [{ label: "Impostazioni del telefono", icon: <SmartphoneIcon />, onSelect: () => phone?.openPhone() }]
              : smUp
                ? []
                : [{ label: "Installa l'app", icon: <DownloadIcon />, onSelect: () => setInstalling(true) }]),
          ]}
        />
      </header>
      <InstallDialog open={installing} onOpenChange={setInstalling} />

      <main className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 lg:px-6", !wide && "pb-[calc(6.5rem+env(safe-area-inset-bottom))]")}>
        <Gestures
          order={ORDER}
          current={section}
          onChange={go}
          onRefresh={async () => {
            refresh()
          }}
        >
          <div className="mx-auto max-w-3xl">
            {section === "inizio" && <Welcome name={me.name} />}
            {section === "elenco" && <ExampleList />}
            {(section === "attivita" || section === "altro") && (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <current.icon />
                  </EmptyMedia>
                  <EmptyTitle>{current.label}</EmptyTitle>
                  <EmptyDescription>Qui va il contenuto di questa sezione.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </Gestures>
      </main>

      {!wide && <Island items={islandItems} value={section} onChange={go} />}
      <NewDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}

function Welcome({ name }: { name: string }) {
  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground">Ciao {name}: questa è la pagina di esempio di s-core.</p>
      <ItemGroup className="gap-2">
        {[
          ["Sezioni", "Isola in basso sul telefono, in alto da PC; l'indirizzo (#/sezione) cambia con la sezione."],
          ["Gesti", "Scorri a destra o a sinistra per la sezione accanto, trascina in giù per aggiornare."],
          ["Menu utente", "Impostazioni, tema, password, esci; «Aggiorna app» col pallino quando l'app Android è vecchia."],
          ["Installa", "A scelta l'app Android (se il server ce l'ha) o la web app."],
        ].map(([t, d]) => (
          <Item key={t} variant="outline">
            <ItemContent>
              <ItemTitle>{t}</ItemTitle>
              <ItemDescription>{d}</ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
    </div>
  )
}

function ExampleList() {
  return (
    <ItemGroup className="gap-2">
      {["Primo", "Secondo", "Terzo"].map((t, i) => (
        <Item key={t} variant="outline" asChild>
          <button type="button" onClick={() => toast(t)}>
            <ItemMedia variant="icon">
              <ListIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t} elemento</ItemTitle>
              <ItemDescription>Riga {i + 1}: titolo, dettaglio, tocco per aprirlo.</ItemDescription>
            </ItemContent>
          </button>
        </Item>
      ))}
    </ItemGroup>
  )
}

/** Il + : un modulo in un riquadro (sul telefono quasi a tutto schermo). */
function NewDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = useState("")
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    toast.success(`«${title.trim() || "Senza nome"}» creato (esempio)`)
    setTitle("")
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Nuovo</DialogTitle>
            <DialogDescription>Esempio di modulo: un campo e Salva.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="nuovo-titolo">Titolo</FieldLabel>
              <Input id="nuovo-titolo" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Tagliando" autoFocus />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit">Salva</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
