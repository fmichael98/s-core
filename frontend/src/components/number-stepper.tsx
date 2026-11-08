import { MinusIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Input } from "@/components/ui/input"

/** Numero con − e + (shadcn/ui), al posto delle frecce del browser. Valore come testo (si può anche scrivere). */
export function NumberStepper({
  id,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
  decimals = false,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  step?: number
  min?: number
  max?: number
  /** unità scritta accanto (es. "h") */
  suffix?: string
  decimals?: boolean
}) {
  const num = (v: string) => Number(v.replace(",", ".")) || 0
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
  const show = (n: number) => String(Math.round(n * 100) / 100).replace(".", decimals ? "," : ".")
  // − e + vanno al passo vicino (da 0,25 con passi di mezz'ora: + porta a 0,5, − a 0); scritto a mano resta com'è
  const add = (d: number) => {
    const k = num(value) / step
    onChange(show(clamp((d > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1) * step)))
  }
  return (
    <ButtonGroup className="w-full">
      <Button type="button" variant="outline" size="icon" className="max-sm:w-8" onClick={() => add(-step)} disabled={min !== undefined && num(value) <= min} aria-label="meno">
        <MinusIcon />
      </Button>
      <div className="relative flex-1">
        <Input
          id={id}
          inputMode={decimals ? "decimal" : "numeric"}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ""))}
          onBlur={() => onChange(show(clamp(num(value))))}
          className="rounded-none text-center tabular-nums"
        />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">{suffix}</span>}
      </div>
      <Button type="button" variant="outline" size="icon" className="max-sm:w-8" onClick={() => add(step)} disabled={max !== undefined && num(value) >= max} aria-label="più">
        <PlusIcon />
      </Button>
    </ButtonGroup>
  )
}
