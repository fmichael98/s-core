import { useEffect, useState } from "react"
import { KeyRoundIcon } from "lucide-react"
import { toast } from "sonner"
import { api, errorText } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { InstallCard } from "@/components/install-app"
import { setUnsaved } from "@/components/leave-guard"
import { PalettePicker } from "@/components/palette-picker"
import { UserAvatar } from "@/components/user-avatar"
import { AndroidCard } from "@/app/android-card"
import { useSession } from "@/app/session"

/** Impostazioni: account (nome mostrato, colore, password), app Android, web app. Le impostazioni dell'app vanno
 *  in schede (Card) in più, tra l'account e le app. */
export function SettingsView() {
  const { me, reload } = useSession()
  const [name, setName] = useState(me.display_name)
  const [color, setColor] = useState(me.color)
  const [busy, setBusy] = useState(false)
  const dirty = name.trim() !== me.display_name || color !== me.color
  useEffect(() => {
    setUnsaved("profile", dirty)
    return () => setUnsaved("profile", false)
  }, [dirty])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api("POST", "/api/profile", { display_name: name, color })
      await reload()
      toast.success("Salvato")
    } catch (x) {
      toast.error(errorText(x))
    }
    setBusy(false)
  }

  return (
    <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Come ti vedono gli altri quando condividi qualcosa.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save}>
            <FieldGroup className="gap-4">
              <div className="flex items-center gap-3">
                <UserAvatar name={name.trim() || me.username} color={color} size="lg" />
                <div className="grid min-w-0">
                  <span className="truncate font-semibold">{name.trim() || me.username}</span>
                  <span className="text-sm text-muted-foreground">{me.username}</span>
                </div>
              </div>
              <Field>
                <FieldLabel htmlFor="st-name">Nome mostrato</FieldLabel>
                <Input id="st-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={me.username} maxLength={40} />
              </Field>
              <Field>
                <FieldLabel>Colore</FieldLabel>
                <PalettePicker value={color} onChange={setColor} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || !dirty}>
                  {busy && <Spinner />} Salva
                </Button>
                <Button type="button" variant="outline" asChild>
                  <a href="/password">
                    <KeyRoundIcon /> Cambia password
                  </a>
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <AndroidCard />
      <InstallCard />
      <p className="text-center text-xs text-muted-foreground">SApp {me.version}</p>
    </div>
  )
}
