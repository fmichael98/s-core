import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ClockIcon, MinusIcon, PlusIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"

const pad = (n: number) => String(n).padStart(2, "0")
/** Minuti scelti a passi di `step` (15: 00, 15, 30, 45). */
const minutesBy = (step: number) => Array.from({ length: Math.floor(60 / step) }, (_, i) => pad(i * step))

/** Colonna di valori da toccare; quello scelto in evidenza e portato in vista all'apertura. */
function Column({ items, value, onPick, label, name }: { items: string[]; value: string; onPick: (v: string) => void; label: string; name: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    ref.current?.querySelector<HTMLElement>("[data-on=true]")?.scrollIntoView({ block: "center" })
  }, [])
  return (
    <div className="flex flex-col">
      <div className="px-1 pb-1 text-center text-[11px] font-medium text-muted-foreground uppercase">{label}</div>
      <ScrollArea className="h-56">
        <div ref={ref} className="flex flex-col gap-1 p-1 pr-2.5">
          {items.map((v) => (
            <Button key={v} type="button" data-on={v === value} variant={v === value ? "default" : "ghost"} size="sm" className="w-12 tabular-nums" aria-label={`${name} ${v}`} aria-pressed={v === value} onClick={() => onPick(v)}>
              {v}
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5)
const fromMin = (n: number) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`

/** Tasto − o +: un tocco sposta di `by` minuti, tenendolo premuto continua. */
function StepButton({ dir, by, onStep, disabled }: { dir: -1 | 1; by: number; onStep: (dir: -1 | 1) => void; disabled: boolean }) {
  const timer = useRef<number | undefined>(undefined)
  const stop = () => window.clearTimeout(timer.current)
  useEffect(() => stop, [])
  const hold = (first: boolean) => {
    onStep(dir)
    timer.current = window.setTimeout(() => hold(false), first ? 450 : 110)
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      // da telefono più stretti: resta posto per l'ora
      className="shrink-0 text-muted-foreground max-sm:w-8"
      disabled={disabled}
      aria-label={`${by} minuti ${dir < 0 ? "prima" : "dopo"}`}
      title={`${by} minuti ${dir < 0 ? "prima" : "dopo"}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        hold(true)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      // da tastiera (Invio, spazio): un passo
      onClick={(e) => e.detail === 0 && onStep(dir)}
    >
      {dir < 0 ? <MinusIcon /> : <PlusIcon />}
    </Button>
  )
}

/** Scelta dell'ora (24 ore, a quarti d'ora) con i componenti shadcn/ui, tra `min` e `max` (di partenza 07:00–19:00,
 *  gli estremi di un turno normale). Valore "HH:MM" o "". `stepper`: con − e + ai lati per spostarla di `step` minuti
 *  (di solito 15; anche le frecce su e giù sul campo). */
export function TimePicker({
  id,
  value,
  onChange,
  className,
  min = "07:00",
  max = "19:00",
  stepper = false,
  step: by = 15,
  minuteStep = 15,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  className?: string
  min?: string
  max?: string
  stepper?: boolean
  step?: number
  /** passo dei minuti nel menu (15: quarti d'ora; 5: ogni 5 minuti) */
  minuteStep?: number
}) {
  const [open, setOpen] = useState(false)
  const [h, m] = value ? value.split(":") : ["", ""]
  const hours = Array.from({ length: +max.slice(0, 2) - +min.slice(0, 2) + 1 }, (_, i) => pad(+min.slice(0, 2) + i))
  // minuti possibili con l'ora scelta (es. alle 19 solo :00)
  const minutes = minutesBy(minuteStep).filter((mm) => !h || (`${h}:${mm}` >= min && `${h}:${mm}` <= max))
  const set = (hh: string, mm: string, close: boolean) => {
    let t = `${hh || pad(+min.slice(0, 2))}:${mm || "00"}`
    if (t > max) t = max
    if (t < min) t = min
    onChange(t)
    if (close) setOpen(false)
  }
  // ultimo valore (tenendo premuto + o − i passi si sommano prima che arrivi quello nuovo)
  const cur = useRef(value)
  cur.current = value
  const step = (dir: -1 | 1) => {
    if (!cur.current) return
    // al passo dopo (o prima): da 10:15 con passi di mezz'ora si va alle 10:30 o alle 10:00
    const now = toMin(cur.current)
    const n = dir > 0 ? Math.floor(now / by) * by + by : Math.ceil(now / by) * by - by
    const t = fromMin(Math.min(toMin(max), Math.max(toMin(min), n)))
    if (t === cur.current) return
    cur.current = t
    onChange(t)
  }

  const picker = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          // l'etichetta del campo punta al gruppo, non a questo pulsante: cliccandola il menu non si riapre
          id={stepper ? undefined : id}
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start gap-2 px-3 font-normal tabular-nums",
            // con − e + da telefono: niente orologio, l'ora al centro
            stepper && "min-w-0 flex-1 max-sm:justify-center max-sm:px-1",
            !value && "text-muted-foreground",
            !stepper && className,
          )}
          onKeyDown={(e) => {
            if (!stepper || open || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return
            e.preventDefault()
            step(e.key === "ArrowUp" ? 1 : -1)
          }}
        >
          <ClockIcon className={cn("text-muted-foreground", stepper && "max-sm:hidden")} />
          {value || "--:--"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="flex gap-1">
          <Column label="ore" name="ore" items={hours} value={h} onPick={(v) => set(v, m, false)} />
          <div className="w-px bg-border" />
          <Column label="min" name="minuti" items={minutes} value={m} onPick={(v) => set(h, v, true)} />
        </div>
      </PopoverContent>
    </Popover>
  )
  if (!stepper) return picker
  return (
    <ButtonGroup id={id} className={cn("w-full", className)}>
      <StepButton dir={-1} by={by} onStep={step} disabled={!value || value <= min} />
      {picker}
      <StepButton dir={1} by={by} onStep={step} disabled={!value || value >= max} />
    </ButtonGroup>
  )
}
