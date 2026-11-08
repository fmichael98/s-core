import { Fragment, type ReactNode } from "react"
import { KeyRoundIcon, LogOutIcon, MoonIcon, SunIcon } from "lucide-react"
import { forgetSaved } from "@/lib/api"
import { phone } from "@/lib/phone"
import { setTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserAvatar } from "@/components/user-avatar"

/** Esce: il server chiude la sessione e si torna alla pagina di accesso (sostituendo questa: Indietro non riapre SApp). */
export function logout(): void {
  // nell'app Android esce l'app (che chiude la sua sessione e torna all'accesso)
  if (phone) return phone.logout()
  Promise.all([fetch("/logout", { method: "POST", credentials: "same-origin" }).catch(() => {}), forgetSaved()]).finally(() => location.replace("/login"))
}

/** Voce in più del menu. */
export interface MenuEntry {
  label: string
  icon: ReactNode
  /** azione; oppure `href` per un collegamento a un'altra pagina */
  onSelect?: () => void
  href?: string
  /** da fare (es. «Aggiorna app»): in evidenza, col pallino (anche sull'avatar) */
  alert?: boolean
  /** cose che aspettano l'utente (es. richieste): numero rosso sulla voce, e sommato sull'avatar */
  badge?: number
  /** numero da guardare ma non urgente (es. «Da testare»): solo sulla voce */
  count?: number
  /** inizia un gruppo nuovo (linea sopra) */
  group?: boolean
  /** in fondo, dopo tema e password (es. «Mi licenzio») */
  end?: boolean
}

/** Pallino «c'è qualcosa da fare». */
const Dot = ({ className }: { className?: string }) => <span aria-hidden="true" className={cn("size-2.5 rounded-full bg-warn ring-2 ring-background", className)} />

function Entry({ e }: { e: MenuEntry }) {
  const inner = (
    <>
      {e.icon}
      {e.label}
      {!!e.badge && (
        <Badge variant="destructive" className="ml-auto h-5 min-w-5 rounded-full px-1.5 tabular-nums">
          {e.badge}
        </Badge>
      )}
      {!e.badge && !!e.count && <Badge className="ml-auto h-5 min-w-5 px-1.5 tabular-nums">{e.count}</Badge>}
      {e.alert && !e.badge && !e.count && <Dot className="ml-auto ring-0" />}
    </>
  )
  const cls = cn(e.alert && "font-semibold text-primary focus:text-primary [&_svg]:!text-primary")
  return e.href ? (
    <DropdownMenuItem asChild className={cls}>
      <a href={e.href}>{inner}</a>
    </DropdownMenuItem>
  ) : (
    <DropdownMenuItem onSelect={e.onSelect} className={cls}>
      {inner}
    </DropdownMenuItem>
  )
}

/** Voci in gruppi: una linea prima di ogni voce con `group`. */
function Entries({ list }: { list: MenuEntry[] }) {
  return list.map((e, i) => (
    <Fragment key={e.label}>
      {e.group && i > 0 && <DropdownMenuSeparator />}
      <Entry e={e} />
    </Fragment>
  ))
}

/** Utente in alto a destra: avatar (da PC anche il nome) e menu con le voci dell'app, tema, password, esci.
 *  Sull'avatar il numero delle cose che aspettano (`badge`), o il pallino se c'è qualcosa da fare (`alert`). */
export function UserMenu({
  name,
  color,
  subtitle,
  entries = [],
  image,
  initials,
}: {
  name: string
  color?: string | null
  subtitle: string
  entries?: MenuEntry[]
  /** immagine del profilo al posto dell'iniziale */
  image?: string
  /** iniziali dell'avatar (due lettere se un altro ha la stessa iniziale) */
  initials?: string
}) {
  const theme = useTheme()
  const waiting = entries.reduce((n, e) => n + (e.badge || 0), 0)
  const alert = entries.some((e) => e.alert)
  const top = entries.filter((e) => !e.end)
  const end = entries.filter((e) => e.end)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-9 gap-2 rounded-full px-1 sm:pl-3"
          aria-label={waiting ? `Account, ${waiting} in attesa` : alert ? "Account (c'è qualcosa da fare)" : "Account"}
        >
          <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{name}</span>
          <span className="relative">
            <UserAvatar name={name} color={color} image={image} initials={initials} />
            {!waiting && alert && <Dot className="absolute -top-0.5 -right-0.5 animate-pulse" />}
          </span>
          {waiting > 0 && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full border-2 border-background px-1 tabular-nums">
              {waiting}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      {/* chiudendo il menu il fuoco non torna sull'avatar: niente contorno rimasto lì */}
      <DropdownMenuContent align="end" className="w-60" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel className="flex items-center gap-3 py-2">
          <UserAvatar name={name} color={color} size="lg" image={image} initials={initials} />
          <div className="grid min-w-0">
            <span className="truncate font-semibold">{name}</span>
            <span className="text-xs font-normal text-muted-foreground">{subtitle}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {top.length > 0 && (
          <>
            <DropdownMenuGroup>
              <Entries list={top} />
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setTheme(theme === "dark" ? "light" : "dark")
            }}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            {theme === "dark" ? "Tema chiaro" : "Tema scuro"}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="/password">
              <KeyRoundIcon />
              Cambia password
            </a>
          </DropdownMenuItem>
          {end.map((e) => (
            <Entry key={e.label} e={e} />
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={logout}>
          <LogOutIcon />
          Esci
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
