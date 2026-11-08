import { useEffect, useState } from "react"
import { DatabaseIcon, DownloadIcon, ServerIcon, TagIcon, TerminalIcon, UsersIcon } from "lucide-react"
import { errorText, get, setOnline } from "@/lib/api"
import type { SystemInfo } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { dur, fmtMB } from "@/admin/format"

const SSH: [string, string][] = [
  ["Log", "journalctl -u sapp -f"],
  ["Riavvio", "sudo systemctl restart sapp"],
  ["Password dimenticata", "sudo -u sapp sapp reset-password admin"],
  ["Configurazione", "/etc/sapp/config.toml"],
]

function Stat({ icon: Icon, label, value, sub, mono = true }: { icon: typeof TagIcon; label: string; value: string; sub: string; mono?: boolean }) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={mono ? "text-2xl tabular-nums" : "truncate text-lg"}>{value}</CardTitle>
        <CardAction>
          <Icon className="size-4 text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent className="truncate px-4 text-xs text-muted-foreground">{sub}</CardContent>
    </Card>
  )
}

/** Amministrazione → Sistema: versione, utenti, database (con copia da scaricare), comandi utili da SSH. */
export function SystemSection() {
  const [s, setS] = useState<SystemInfo | null>(null)
  const [err, setErr] = useState("")
  useEffect(() => {
    get<SystemInfo>("/api/admin/system").then(
      (x) => {
        setS(x)
        setOnline(true)
      },
      (e) => setErr(errorText(e)),
    )
  }, [])
  if (!s) return err ? <p className="py-10 text-center text-sm text-muted-foreground">{err}</p> : <Spinner className="mx-auto my-16 size-6" />
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={TagIcon} label="Versione" value={s.version} sub={"attiva da " + dur(s.now - s.started)} />
        <Stat icon={UsersIcon} label="Utenti" value={String(s.users)} sub={`${s.sessions} sessioni aperte`} />
        <Stat icon={DatabaseIcon} label="Database" value={fmtMB(s.db_size)} sub={s.database} />
        <Stat icon={ServerIcon} label="Server" value={s.hostname || "—"} sub={s.os} mono={false} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Copia del database</CardTitle>
          <CardDescription>
            Scarica una copia completa (tutti gli utenti) del database SQLite, presa in modo coerente anche mentre SApp è in uso. Ogni aggiornamento ne fa comunque una in{" "}
            <code className="font-mono">/var/lib/sapp/backup</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <a href="/api/admin/db" download>
              <DownloadIcon /> Scarica database
            </a>
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TerminalIcon className="size-4" /> Da SSH, in caso di bisogno
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {SSH.map(([k, v]) => (
                <TableRow key={k}>
                  <TableCell className="w-48 align-top font-medium">{k}</TableCell>
                  <TableCell className="whitespace-normal">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all">{v}</code>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
