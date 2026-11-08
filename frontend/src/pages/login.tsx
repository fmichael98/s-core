/* Pagina di accesso. Il browser (o l'app installata) può ricordare utente e password. */

import { useState } from "react"
import { CircleAlertIcon } from "lucide-react"
import { boot } from "@/lib/boot"
import { forgetSaved } from "@/lib/api"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { AuthCard } from "@/components/auth-card"
import { InstallButton } from "@/components/install-app"
import { PasswordInput } from "@/components/password-input"

/** Messaggio d'errore; `min`: minuti del blocco (li dice il server, si scelgono nella Configurazione). */
const message = (err: string, min: string | null) =>
  err === "locked"
    ? `Troppi tentativi sbagliati: accesso bloccato per ${min ? `${min} minuti` : "un po'"}.`
    : err === "1"
      ? "Utente o password non validi."
      : "Server non raggiungibile: riprova tra poco."

function Login() {
  const [err, setErr] = useState(() => new URLSearchParams(location.search).get("err"))
  const [min, setMin] = useState(() => new URLSearchParams(location.search).get("min"))
  const [busy, setBusy] = useState(false)

  // l'accesso si manda "dietro le quinte" e poi la pagina si sostituisce: Indietro non riporta qui
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch("/login", {
        method: "POST",
        body: new URLSearchParams(new FormData(e.currentTarget) as unknown as Record<string, string>),
        credentials: "same-origin",
      })
      const to = new URL(res.url)
      if (to.pathname === "/login") {
        setErr(to.searchParams.get("err") || "1")
        setMin(to.searchParams.get("min"))
        setBusy(false)
        return
      }
      // dati salvati per consultarli senza rete: erano di chi c'era prima su questo telefono
      await forgetSaved()
      location.replace(to.pathname + to.hash)
    } catch {
      setErr("rete")
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Accedi" description="Calendario, turni, scadenze e sveglie">
      <form method="post" action="/login" onSubmit={submit}>
        <FieldGroup className="gap-4">
          {err && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>{message(err, min)}</AlertTitle>
            </Alert>
          )}
          <Field>
            <FieldLabel htmlFor="u">Utente</FieldLabel>
            <Input id="u" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus required />
          </Field>
          <Field>
            <FieldLabel htmlFor="p">Password</FieldLabel>
            <PasswordInput id="p" name="password" autoComplete="current-password" required />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Spinner />}
            {busy ? "Accesso…" : "Entra"}
          </Button>
        </FieldGroup>
      </form>
      <InstallButton className="mt-4 w-full" label="Installa SApp" />
    </AuthCard>
  )
}

boot(<Login />)
