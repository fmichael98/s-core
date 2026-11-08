import { useState } from "react"
import { CalendarIcon, XIcon } from "lucide-react"
import { it } from "react-day-picker/locale"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/** "2026-10-24" ↔ Date (ora locale, a mezzogiorno: niente sorprese col cambio dell'ora) */
const toDate = (s: string) => (s ? new Date(s + "T12:00:00") : undefined)
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/** Scelta di un giorno dal calendario (shadcn/ui), in italiano, settimana da lunedì. Valore "AAAA-MM-GG" o "". */
export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  fromYear,
  month,
  placeholder = "scegli il giorno",
  clearable,
  only,
  className,
  short,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  /** primo giorno che si può scegliere ("AAAA-MM-GG") */
  min?: string
  /** ultimo giorno che si può scegliere ("AAAA-MM-GG") */
  max?: string
  /** mese e anno da tendine (per date lontane, es. l'immatricolazione): da questo anno a quello di `max` */
  fromYear?: number
  /** mese da mostrare aprendo il calendario quando non c'è ancora un giorno ("AAAA-MM-GG") */
  month?: string
  placeholder?: string
  /** con la × per svuotarlo (campo facoltativo) */
  clearable?: boolean
  /** solo i giorni che vanno bene (es. i sabati) */
  only?: (d: Date) => boolean
  className?: string
  /** data breve («sab 7 nov 2026»): per i campi stretti */
  short?: boolean
}) {
  const [open, setOpen] = useState(false)
  const date = toDate(value)
  const label = date?.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: short ? "short" : "long", year: "numeric" })
  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" className={cn("w-full justify-start gap-2 px-3 font-normal", !date && "text-muted-foreground", clearable && date && "pr-9")}>
            <CalendarIcon className="text-muted-foreground" />
            <span className="truncate first-letter:uppercase">{label ?? placeholder}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="single"
            locale={it}
            weekStartsOn={1}
            selected={date}
            defaultMonth={date ?? toDate(month ?? "") ?? toDate(max ?? "") ?? toDate(min ?? "") ?? new Date()}
            captionLayout={fromYear ? "dropdown" : "label"}
            startMonth={fromYear ? new Date(fromYear, 0) : undefined}
            endMonth={fromYear ? (toDate(max ?? "") ?? new Date()) : undefined}
            disabled={[...(min ? [{ before: toDate(min)! }] : []), ...(max ? [{ after: toDate(max)! }] : []), ...(only ? [(d: Date) => !only(d)] : [])]}
            onSelect={(d) => {
              if (d) onChange(toISO(d))
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      {clearable && date && (
        <Button type="button" variant="ghost" size="icon-xs" className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground" onClick={() => onChange("")} aria-label="togli il giorno">
          <XIcon />
        </Button>
      )}
    </div>
  )
}
