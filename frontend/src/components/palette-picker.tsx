import { CheckIcon } from "lucide-react"
import { PALETTE } from "@/lib/palette"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** Scelta del colore dell'avatar: pallini della tavolozza. */
export function PalettePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const swatch = (key: string, label: string, body: React.ReactNode, cls: string) => (
    <Tooltip key={key}>
      <TooltipTrigger asChild>
        <button
          type="button"
          role="radio"
          aria-checked={value === key}
          aria-label={label}
          onClick={() => onChange(key)}
          className={cn(
            "grid size-8 place-items-center rounded-full outline-none ring-offset-2 ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring",
            value === key && "ring-2 ring-primary",
            cls,
          )}
        >
          {body}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2.5 p-1">
      {PALETTE.map(([k, l]) => swatch(k, l, value === k ? <CheckIcon className="size-4 text-[var(--pal-ink)]" /> : null, cn("bg-[var(--pal)]", "pal-" + k)))}
    </div>
  )
}
