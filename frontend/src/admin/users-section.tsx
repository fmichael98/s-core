import { Fragment, useEffect, useState, type ReactNode } from "react"
import { BanIcon, EllipsisVerticalIcon, KeyRoundIcon, PaletteIcon, PlusIcon, Trash2Icon, UserCheckIcon } from "lucide-react"
import { toast } from "sonner"
import { api, errorText, get } from "@/lib/api"
import type { Me, UserRow } from "@/lib/types"
import { cn } from "@/lib/utils"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { PalettePicker } from "@/components/palette-picker"
import { PasswordInput } from "@/components/password-input"
import { UserAvatar } from "@/components/user-avatar"
import { fwhen } from "@/admin/format"

/** Come si chiamano i dati di un utente nell'elenco (es. ["veicolo", "veicoli"], ["calendario", "calendari"]). */
const ITEM: [string, string] = ["elemento", "elementi"]

/** Dati in fila separati da un punto; si va a capo solo tra uno e l'altro. */
function Facts({ items, className }: { items: ReactNode[]; className?: string }) {
  const list = items.filter(Boolean)
  return (
    <p className={cn("leading-relaxed text-muted-foreground", className)}>
      {list.map((x, i) => (
        <Fragment key={i}>
          <span className="whitespace-nowrap">
            {x}
            {i < list.length - 1 && (
              <span aria-hidden className="mx-1.5 opacity-60">
                ·
              </span>
            )}
          </span>{" "}
        </Fragment>
      ))}
    </p>
  )
}

/** Utenti: elenco, nuovo utente, nome e colore, password temporanea, attiva/disattiva, elimina. */
export function UsersSection({ me }: { me: Me }) {
  const [items, setItems] = useState<UserRow[] | null>(null)
  const [err, setErr] = useState("")
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [deleting, setDeleting] = useState<UserRow | null>(null)
  const [resetting, setResetting] = useState<UserRow | null>(null)

  const load = async () => {
    try {
      setItems((await get<{ users: UserRow[] }>("/api/admin/users")).users)
    } catch (e) {
      setErr(errorText(e))
    }
  }
  useEffect(() => {
    load()
  }, [])

  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn()
      toast.success(done)
      load()
    } catch (e) {
      toast.error(errorText(e))
    }
  }
  if (!items) return err ? <p className="py-10 text-center text-sm text-muted-foreground">{err}</p> : <Spinner className="mx-auto my-16 size-6" />

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Utenti</CardTitle>
          <CardDescription>Ognuno usa l'app con i suoi dati (e quelli che altri condividono con lui). L'amministratore gestisce solo utenti e server.</CardDescription>
          <CardAction>
            <Button size="sm" onClick={() => setAdding(true)}>
              <PlusIcon /> Utente
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ItemGroup className="rounded-lg border">
            {items.map((u, i) => {
              const self = u.id === me.id
              const admin = u.role === "admin"
              return (
                <div key={u.id}>
                  {i > 0 && <ItemSeparator />}
                  <Item size="sm" className={cn("rounded-none", u.disabled && "opacity-50")}>
                    <ItemMedia>
                      <UserAvatar name={u.name} color={u.color} />
                    </ItemMedia>
                    <ItemContent className="min-w-0">
                      <ItemTitle className="flex-wrap gap-x-2 gap-y-1">
                        <span className="inline-flex items-baseline gap-1.5">
                          {u.name}
                          {u.display_name && <span className="text-xs font-normal text-muted-foreground">{u.username}</span>}
                        </span>
                        {admin && (
                          <Badge variant="outline" className="border-warn/40 text-warn">
                            amministratore
                          </Badge>
                        )}
                        {self && <Badge variant="outline">tu</Badge>}
                        {u.disabled && <Badge variant="outline">disattivato</Badge>}
                        {u.must_change && (
                          <Badge variant="outline" className="border-warn/40 text-warn">
                            deve cambiare password
                          </Badge>
                        )}
                      </ItemTitle>
                      <Facts
                        className="text-xs"
                        items={[
                          !admin && u.items > 0 && `${u.items} ${u.items === 1 ? ITEM[0] : ITEM[1]}`,
                          u.last_login ? `ultimo accesso ${fwhen(u.last_login)}` : "mai entrato",
                          u.sessions > 0 && `${u.sessions} ${u.sessions === 1 ? "sessione aperta" : "sessioni aperte"}`,
                        ]}
                      />
                    </ItemContent>
                    <ItemActions>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={"Gestisci " + u.name}>
                            <EllipsisVerticalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                          <DropdownMenuLabel>{u.name}</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => setEditing(u)}>
                            <PaletteIcon /> Nome e colore
                          </DropdownMenuItem>
                          {!self && (
                            <>
                              <DropdownMenuItem onSelect={() => setResetting(u)}>
                                <KeyRoundIcon /> Nuova password
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() =>
                                  act(
                                    () => api("POST", `/api/admin/users/${u.id}/disabled`, { disabled: !u.disabled }),
                                    u.disabled ? `${u.name} può di nuovo entrare` : `${u.name} non può più entrare`,
                                  )
                                }
                              >
                                {u.disabled ? <UserCheckIcon /> : <BanIcon />}
                                {u.disabled ? "Riattiva" : "Disattiva"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(u)}>
                                <Trash2Icon /> Elimina
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </ItemActions>
                  </Item>
                </div>
              )
            })}
          </ItemGroup>
        </CardContent>
      </Card>

      <NewUserDialog open={adding} onClose={() => setAdding(false)} onDone={load} />
      <EditDialog user={editing} onClose={() => setEditing(null)} onDone={load} />
      <PasswordDialog user={resetting} onClose={() => setResetting(null)} onDone={load} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && deleting.items > 0 && (
                <b className="text-destructive">Si cancellano anche i suoi dati ({deleting.items === 1 ? `1 ${ITEM[0]}` : `${deleting.items} ${ITEM[1]}`}). </b>
              )}
              Non si torna indietro. Se vuoi solo impedirgli di entrare, disattivalo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleting && act(() => api("DELETE", "/api/admin/users/" + deleting.id), "Eliminato")}
            >
              <Trash2Icon /> Sì, elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function NewUserDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [username, setUsername] = useState("")
  const [name, setName] = useState("")
  const [admin, setAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setUsername("")
      setName("")
      setAdmin(false)
    }
  }, [open])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const j = await api<{ username: string }>("POST", "/api/admin/users", { username, display_name: name, admin })
      toast.success(`Creato: primo accesso con utente e password «${j.username}»`)
      onClose()
      onDone()
    } catch (x) {
      toast.error(errorText(x))
    }
    setBusy(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Nuovo utente</DialogTitle>
            <DialogDescription>La prima password è uguale al nome utente: al primo accesso la cambia.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="nu-user">Nome utente</FieldLabel>
              <Input id="nu-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="es. m.rossi" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
              <FieldDescription>Da 2 a 32 caratteri: lettere, numeri, punto, trattino e _.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="nu-name">Nome mostrato</FieldLabel>
              <Input id="nu-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Mario" maxLength={40} />
            </Field>
            <Field orientation="horizontal">
              <Switch id="nu-admin" checked={admin} onCheckedChange={setAdmin} />
              <FieldLabel htmlFor="nu-admin" className="font-normal">
                Amministratore (gestisce utenti e server, non usa l'app)
              </FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={busy || username.trim().length < 2}>
              {busy ? <Spinner /> : <PlusIcon />} Crea
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditDialog({ user, onClose, onDone }: { user: UserRow | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("")
  const [color, setColor] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (user) {
      setName(user.display_name)
      setColor(user.color)
    }
  }, [user])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    try {
      await api("POST", "/api/admin/users/" + user.id, { display_name: name, color })
      toast.success("Salvato")
      onClose()
      onDone()
    } catch (x) {
      toast.error(errorText(x))
    }
    setBusy(false)
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{user?.username}</DialogTitle>
            <DialogDescription>Nome mostrato e colore dell'avatar.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="ed-name">Nome mostrato</FieldLabel>
              <Input id="ed-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={user?.username} maxLength={40} />
            </Field>
            <Field>
              <FieldLabel>Colore</FieldLabel>
              <PalettePicker value={color} onChange={setColor} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner />} Salva
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Nuova password scelta dall'amministratore: l'utente la cambia al primo accesso, i suoi accessi aperti si chiudono. */
function PasswordDialog({ user, onClose, onDone }: { user: UserRow | null; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (user) setPassword("")
  }, [user])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    try {
      await api("POST", `/api/admin/users/${user.id}/password`, { password })
      toast.success(`Password di ${user.name} cambiata`)
      onClose()
      onDone()
    } catch (x) {
      toast.error(errorText(x))
    }
    setBusy(false)
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Nuova password per {user?.name}</DialogTitle>
            <DialogDescription>Sceglila tu e dagliela: al primo accesso la cambia. Si chiudono i suoi accessi aperti (anche sul telefono).</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="pw-new">Password provvisoria</FieldLabel>
            <PasswordInput id="pw-new" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={busy || password === ""}>
              {busy ? <Spinner /> : <KeyRoundIcon />} Cambia password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
