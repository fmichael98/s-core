/* L'isola in basso: le sezioni dell'app in una pastiglia che galleggia sopra il contenuto (che sfuma nel fondo man
   mano che le si avvicina). La voce `center` è un tondo pieno incastrato in mezzo: è un'azione più che una pagina. */

import type { ComponentType } from "react"
import { cn } from "@/lib/utils"

export interface IslandItem {
  key: string
  label: string
  icon: ComponentType<{ className?: string }>
  /** numerino sull'icona (cose da guardare) */
  badge?: number
  center?: boolean
}

export function Island({ items, value, onChange }: { items: IslandItem[]; value: string; onChange: (key: string) => void }) {
  return (
    <>
      {/* il contenuto vicino all'isola si scurisce piano fino al fondo */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-[calc(9.5rem+env(safe-area-inset-bottom))]"
        style={{
          background:
            "linear-gradient(to bottom, transparent, color-mix(in oklab, var(--background) 55%, transparent) 35%, color-mix(in oklab, var(--background) 90%, transparent) 62%, var(--background) 82%)",
        }}
      />
      <nav
        aria-label="Sezioni"
        className="fixed inset-x-4 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 mx-auto flex h-[58px] max-w-[22rem] items-center rounded-[26px] border bg-card/90 px-1 shadow-[0_10px_28px_rgba(0,0,0,0.42)] backdrop-blur-xl"
        style={{ viewTransitionName: "island" }}
      >
        {items.map(({ key, label, icon: Icon, badge, center }) => {
          const on = key === value
          return center ? (
            <button
              key={key}
              type="button"
              aria-label={label}
              aria-current={on ? "page" : undefined}
              onClick={() => onChange(key)}
              className={cn(
                "mx-1 grid size-[46px] shrink-0 place-items-center rounded-full bg-primary text-primary-foreground outline-none transition-transform active:scale-95 focus-visible:ring-[3px] focus-visible:ring-ring/50",
                "shadow-[inset_0_-3px_0_rgba(0,0,0,0.12),0_6px_18px_color-mix(in_oklab,var(--primary)_25%,transparent)]",
                on && "ring-2 ring-primary/40 ring-offset-2 ring-offset-card",
              )}
            >
              <Icon className="size-[22px]" />
            </button>
          ) : (
            <button
              key={key}
              type="button"
              aria-current={on ? "page" : undefined}
              onClick={() => onChange(key)}
              className={cn(
                "flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] text-[10px] font-medium outline-none transition-colors focus-visible:bg-accent/50",
                on ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="relative grid size-[19px] place-items-center">
                <Icon className="size-[19px]" />
                {!!badge && (
                  <span className="absolute -top-1.5 left-[60%] grid h-[15px] min-w-[15px] place-items-center rounded-full bg-warn px-1 text-[10px] leading-none font-extrabold text-neutral-950">
                    {badge}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate">{label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
