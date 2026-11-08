import { cn } from "@/lib/utils"
import { palette } from "@/lib/palette"

const SIZES = { xs: "size-5 text-[10px]", sm: "size-6 text-[11px]", default: "size-8 text-sm", lg: "size-10 text-base" }
/** due iniziali: un po' più piccole */
const TWO = { xs: "text-[8px] tracking-tighter", sm: "text-[9.5px] tracking-tight", default: "text-xs", lg: "text-sm" }

/** Iniziale dell'utente (o le `initials` date: due lettere se un altro ha la stessa iniziale) su un cerchio (o
 *  quadrato) del suo colore; con `image` un'immagine. */
export function UserAvatar({
  name,
  color,
  size = "default",
  square,
  image,
  initials,
  hollow,
  className,
}: {
  name: string
  color?: string | null
  size?: "xs" | "sm" | "default" | "lg"
  square?: boolean
  image?: string
  initials?: string | null
  /** solo il contorno tratteggiato e la lettera del suo colore (es. proposto, non ancora messo) */
  hollow?: boolean
  className?: string
}) {
  const text = (initials || (name || "?").slice(0, 1)).toUpperCase()
  const p = palette(color)
  if (image)
    return (
      <img
        src={image}
        alt=""
        draggable={false}
        className={cn("shrink-0 bg-black object-cover select-none", square ? "rounded-md" : "rounded-full", SIZES[size], className)}
      />
    )
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center font-semibold select-none",
        hollow
          ? color
            ? "border border-dashed border-[var(--pal)] text-[var(--pal)]"
            : "border border-dashed border-primary text-primary"
          : color
            ? "bg-[var(--pal)] text-[var(--pal-ink)]"
            : "bg-primary text-primary-foreground",
        square ? "rounded-md" : "rounded-full",
        SIZES[size],
        text.length > 1 && TWO[size],
        p.className,
        className,
      )}
      style={p.style}
    >
      {text}
    </span>
  )
}

/** Pallino del colore dell'utente. */
export function ColorDot({ color, className }: { color?: string | null; className?: string }) {
  const p = palette(color)
  return <span className={cn("inline-block size-2 shrink-0 rounded-full bg-[var(--pal)]", p.className, className)} style={p.style} />
}
