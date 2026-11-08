import { useEffect, useRef, useState, type ReactNode } from "react"
import { CheckIcon, RefreshCwIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { errorText } from "@/lib/api"
import { overlayOpen } from "@/lib/overlays"

type Pull = "idle" | "pull" | "ready" | "busy" | "done" | "error"

const MAX = 90
const GO = 64

/** Gesti col dito sul contenuto: scorri a destra/sinistra = sezione accanto, trascina in giù = aggiorna.
 *  Un gesto solo alla volta: la prima direzione decisa (orizzontale o verticale) vince. */
export function Gestures({
  order,
  current,
  onChange,
  onRefresh,
  children,
  className,
}: {
  order: string[]
  current: string
  onChange: (v: string) => void
  onRefresh: () => Promise<void>
  children: ReactNode
  /** classi del contenuto (es. h-full per una vista che riempie lo spazio) */
  className?: string
}) {
  const content = useRef<HTMLDivElement>(null)
  const [pull, setPull] = useState<Pull>("idle")
  const [dist, setDist] = useState(0)
  const [enter, setEnter] = useState<"left" | "right" | null>(null)
  const live = useRef({ order, current, onChange, onRefresh })
  live.current = { order, current, onChange, onRefresh }

  useEffect(() => {
    if (!("ontouchstart" in window)) return
    document.documentElement.classList.add("ptr-on")
    let x0: number | null = null
    let y0 = 0
    let t0 = 0
    let mode: "pull" | "swipe" | "none" | null = null
    let d = 0
    let dx = 0
    let busy = false
    let inner: HTMLElement | null = null
    const atTop = () => window.scrollY <= 0 && (!inner || inner.scrollTop <= 0)
    const el = () => content.current
    const place = (x: number, anim: boolean) => {
      const c = el()
      if (!c) return
      c.style.transition = anim ? "transform .2s cubic-bezier(.2,.7,.3,1), opacity .2s" : "none"
      c.style.transform = x ? `translateX(${x}px)` : ""
      c.style.opacity = x ? String(Math.max(0.4, 1 - Math.abs(x) / innerWidth)) : ""
    }
    const neighbour = (dir: number) => {
      const o = live.current.order
      const i = o.indexOf(live.current.current)
      return i < 0 ? undefined : o[i + dir]
    }
    const start = (e: TouchEvent) => {
      x0 = null
      if (busy || e.touches.length !== 1 || overlayOpen()) return
      const target = e.target as Element
      // griglia e liste che scorrono di lato, barra delle sezioni, menu: non sono gesti
      if (target.closest("[data-no-swipe], [role=tablist], [data-radix-popper-content-wrapper], input[type=range]")) return
      // dentro un riquadro che scorre (il contenuto della scheda): si aggiorna solo se è in cima anche lui
      inner = target.closest<HTMLElement>("[data-scroll]")
      x0 = e.touches[0].clientX
      y0 = e.touches[0].clientY
      t0 = Date.now()
      mode = null
      d = 0
      dx = 0
    }
    const move = (e: TouchEvent) => {
      if (x0 == null) return
      const mx = e.touches[0].clientX - x0
      const my = e.touches[0].clientY - y0
      if (!mode) {
        // sotto i 10 px è un tocco: guai a fermarlo (un touchmove annullato toglie il «click», e il tocco non faceva
        // niente se il dito scivolava appena in giù col contenuto in cima). Il gesto si decide solo dopo.
        if (Math.abs(mx) < 10 && Math.abs(my) < 10) return
        if (Math.abs(mx) > Math.abs(my) * 1.3) {
          const w = innerWidth
          mode = x0 > w * 0.1 && x0 < w * 0.9 ? "swipe" : "none" // non dal bordo (gesto "indietro" del telefono)
        } else mode = my > 0 && atTop() && Math.abs(my) > Math.abs(mx) * 1.3 ? "pull" : "none"
      }
      if (mode === "pull") {
        if (my <= 0 || !atTop()) {
          d = 0
          setDist(0)
          setPull("idle")
          return
        }
        if (e.cancelable) e.preventDefault()
        d = Math.min(MAX, my * 0.5)
        setDist(d)
        setPull(d >= GO ? "ready" : "pull")
      } else if (mode === "swipe") {
        if (!neighbour(mx < 0 ? 1 : -1)) {
          dx = 0
          place(0, false)
          return
        }
        dx = mx
        place(dx, false)
        if (e.cancelable) e.preventDefault()
      }
    }
    const end = () => {
      if (x0 == null) return
      x0 = null
      if (mode === "pull") {
        if (d < GO) {
          setDist(0)
          setPull("idle")
          return
        }
        busy = true
        setDist(GO)
        setPull("busy")
        ;(async () => {
          const t = Date.now()
          let err: unknown = null
          try {
            await live.current.onRefresh()
          } catch (e) {
            err = e
          }
          await new Promise((r) => setTimeout(r, Math.max(0, 600 - (Date.now() - t))))
          setPull(err ? "error" : "done")
          if (err) toast.error(errorText(err))
          await new Promise((r) => setTimeout(r, 500))
          setDist(0)
          setPull("idle")
          busy = false
        })()
        return
      }
      if (mode !== "swipe") return
      const dir = dx < 0 ? 1 : -1
      const next = neighbour(dir)
      const fast = Date.now() - t0 < 300 && Math.abs(dx) > 15
      if (!next || (Math.abs(dx) < 60 && !fast)) {
        place(0, true)
        return
      }
      place(-dir * innerWidth * 0.3, true)
      setTimeout(() => {
        place(0, false)
        setEnter(dir > 0 ? "right" : "left")
        live.current.onChange(next)
        window.scrollTo(0, 0)
      }, 120)
    }
    const cancel = () => {
      if (x0 == null) return
      x0 = null
      if (mode === "swipe") place(0, true)
      if (mode === "pull") {
        setDist(0)
        setPull("idle")
      }
    }
    window.addEventListener("touchstart", start, { passive: true })
    window.addEventListener("touchmove", move, { passive: false })
    window.addEventListener("touchend", end, { passive: true })
    window.addEventListener("touchcancel", cancel, { passive: true })
    return () => {
      window.removeEventListener("touchstart", start)
      window.removeEventListener("touchmove", move)
      window.removeEventListener("touchend", end)
      window.removeEventListener("touchcancel", cancel)
    }
  }, [])

  const shown = pull !== "idle"
  return (
    <>
      <div
        aria-hidden
        className={cn(
          "fixed top-24 left-1/2 z-40 grid size-10 place-items-center rounded-full border bg-popover text-muted-foreground shadow-lg",
          !shown && "pointer-events-none opacity-0",
          (pull === "ready" || pull === "busy") && "border-primary text-primary",
          pull === "done" && "border-primary bg-primary text-primary-foreground",
          pull === "error" && "border-destructive bg-destructive text-white",
        )}
        style={{
          transform: `translate(-50%, ${dist - 50}px)`,
          opacity: shown ? Math.min(1, dist / GO) : 0,
          transition: pull === "pull" || pull === "ready" ? "none" : "transform .2s, opacity .2s",
        }}
      >
        {pull === "done" ? (
          <CheckIcon className="size-5" />
        ) : pull === "error" ? (
          <XIcon className="size-5" />
        ) : (
          <RefreshCwIcon
            className={cn("size-5", pull === "busy" && "animate-spin")}
            style={pull === "busy" ? undefined : { transform: `rotate(${dist * 4}deg)` }}
          />
        )}
      </div>
      <div
        ref={content}
        className={cn(className, enter === "right" && "animate-in slide-in-from-right-8 fade-in-50", enter === "left" && "animate-in slide-in-from-left-8 fade-in-50")}
        onAnimationEnd={() => setEnter(null)}
      >
        {children}
      </div>
    </>
  )
}
