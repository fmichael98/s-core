/* Cambio password (obbligatorio al primo accesso). */

import { useEffect, useState } from "react"
import { CircleAlertIcon, CircleCheckIcon, CircleIcon, CircleXIcon } from "lucide-react"
import { api, errorText, get } from "@/lib/api"
import { boot } from "@/lib/boot"
import type { Me } from "@/lib/types"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { AuthCard } from "@/components/auth-card"
import { PasswordInput } from "@/components/password-input"
import { logout } from "@/components/user-menu"
import { cn } from "@/lib/utils"

/** Lunghezza minima delle password (come sul server). */
const MIN = 8

/** Un requisito della password: grigio finché non si scrive, verde se va bene, rosso se no (dopo aver provato a
 *  salvare, o appena si scrive se è già sbagliato). */
function Rule({ ok, show, children }: { ok: boolean; show: boolean; children: React.ReactNode }) {
  const Icon = ok ? CircleCheckIcon : show ? CircleXIcon : CircleIcon
  return (
    <li className={cn("flex items-center gap-2 text-sm", ok ? "text-ok" : show ? "font-medium text-destructive" : "text-muted-foreground")}>
      <Icon className="size-4 shrink-0" />
      {children}
    </li>
  )
}

/** Esc da PC: torna alla pagina da cui si è arrivati, o all'inizio. */
function back(): void {
  try {
    if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) return history.back()
  } catch {
    /* indirizzo non valido */
  }
  location.href = "/"
}

function Password() {
  const [me, setMe] = useState<Me | null>(null)
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [again, setAgain] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)
  // dopo il primo «Salva» i requisiti non rispettati diventano rossi
  const [tried, setTried] = useState(false)

  useEffect(() => {
    get<Me>("/api/me").then(setMe, () => {})
    const esc = (e: KeyboardEvent) => e.key === "Escape" && back()
    document.addEventListener("keydown", esc)
    return () => document.removeEventListener("keydown", esc)
  }, [])

  // requisiti della nuova password (gli stessi che controlla il server)
  const long = next.length >= MIN
  const notName = !!next && next.toLowerCase() !== (me?.username ?? "").toLowerCase()
  const notCurrent = !!next && next !== current
  const same = !!again && next === again
  const valid = long && notName && notCurrent && same

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr("")
    setTried(true)
    if (!valid) return
    setBusy(true)
    try {
      const j = await api<{ redirect?: string }>("POST", "/api/password", { current, new: next })
      location.replace(j.redirect || "/")
      return
    } catch (x) {
      setErr(errorText(x))
    }
    setBusy(false)
  }

  const intro = me && !me.must_change ? `Utente ${me.username}. Le altre sessioni aperte verranno chiuse.` : "Al primo accesso devi scegliere una password personale."

  return (
    <AuthCard title="Cambia password" description={intro}>
      <form onSubmit={save}>
        {/* per il gestore delle password del browser: di chi è la password nuova */}
        <input type="text" name="username" autoComplete="username" value={me?.username ?? ""} readOnly hidden />
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="c">Password attuale</FieldLabel>
            <PasswordInput id="c" autoComplete="current-password" autoFocus required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="n">Nuova password</FieldLabel>
            <PasswordInput
              id="n"
              autoComplete="new-password"
              required
              aria-invalid={tried && !(long && notName && notCurrent)}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <ul className="grid gap-1 pt-1">
              <Rule ok={long} show={tried}>
                Almeno {MIN} caratteri{next && !long ? ` (ancora ${MIN - next.length})` : ""}
              </Rule>
              <Rule ok={notName} show={tried || (!!next && !notName)}>
                Diversa dal nome utente
              </Rule>
              <Rule ok={notCurrent} show={tried || (!!next && !notCurrent)}>
                Diversa da quella attuale
              </Rule>
            </ul>
          </Field>
          <Field>
            <FieldLabel htmlFor="r">Ripeti la nuova password</FieldLabel>
            <PasswordInput id="r" autoComplete="new-password" required aria-invalid={tried && !same} value={again} onChange={(e) => setAgain(e.target.value)} />
            <ul className="grid gap-1 pt-1">
              <Rule ok={same} show={tried || (again.length >= next.length && !!again && !same)}>
                Uguale alla nuova password
              </Rule>
            </ul>
          </Field>
          {err && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>{err}</AlertTitle>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Spinner />} Salva
          </Button>
          {me && (
            <div className="flex items-center justify-center gap-1 text-sm">
              {!me.must_change && (
                <>
                  <Button variant="link" size="sm" asChild>
                    <a href={me.role === "admin" ? "/admin" : "/"}>Annulla</a>
                  </Button>
                  <span className="text-muted-foreground">·</span>
                </>
              )}
              <Button type="button" variant="link" size="sm" className="text-muted-foreground" onClick={logout}>
                Esci
              </Button>
            </div>
          )}
        </FieldGroup>
      </form>
    </AuthCard>
  )
}

boot(<Password />)
