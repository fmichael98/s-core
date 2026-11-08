import type { ReactNode } from "react"
import { KeyRoundIcon, LogOutIcon, MoonIcon, SunIcon } from "lucide-react"
import { forgetSaved } from "@/lib/api"
import { phone } from "@/lib/phone"
import { setTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
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

/** Voce in più del menu (es. Impostazioni, sezioni che non stanno nell'isola). */
export interface MenuEntry {
  label: string
  icon: ReactNode
  onSelect: () => void
  /** da fare (es. «Aggiorna app»): in evidenza, col pallino come sull'avatar */
  alert?: boolean
}

/** Pallino «c'è qualcosa da fare». */
const Dot = ({ className }: { className?: string }) => <span aria-hidden="true" className={cn("size-2.5 rounded-full bg-warn ring-2 ring-background", className)} />

/** Utente in alto a destra: avatar (da PC anche il nome) e menu con le voci dell'app, tema, password, esci. */
export function UserMenu({ name, color, subtitle, entries = [] }: { name: string; color?: string | null; subtitle: string; entries?: MenuEntry[] }) {
  const theme = useTheme()
  // una voce da fare: pallino sull'avatar finché non la si fa
  const alert = entries.some((e) => e.alert)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 gap-2 rounded-full px-1 sm:pl-3" aria-label={alert ? "Account (c'è un aggiornamento)" : "Account"}>
          <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{name}</span>
          <span className="relative">
            <UserAvatar name={name} color={color} />
            {alert && <Dot className="absolute -top-0.5 -right-0.5 animate-pulse" />}
          </span>
        </Button>
      </DropdownMenuTrigger>
      {/* chiudendo il menu il fuoco non torna sull'avatar: niente contorno rimasto lì */}
      <DropdownMenuContent align="end" className="w-60" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel className="flex items-center gap-3 py-2">
          <UserAvatar name={name} color={color} size="lg" />
          <div className="grid min-w-0">
            <span className="truncate font-semibold">{name}</span>
            <span className="text-xs font-normal text-muted-foreground">{subtitle}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {entries.map((e) => (
            <DropdownMenuItem key={e.label} onSelect={e.onSelect} className={cn(e.alert && "font-semibold text-primary focus:text-primary [&_svg]:!text-primary")}>
              {e.icon}
              {e.label}
              {e.alert && <Dot className="ml-auto ring-0" />}
            </DropdownMenuItem>
          ))}
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
