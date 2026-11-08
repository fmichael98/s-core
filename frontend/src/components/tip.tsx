import type { ReactElement, ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** Suggerimento al passaggio del mouse (shadcn/ui), al posto del "title" del browser. Senza testo non fa niente. */
export function Tip({ text, children, side }: { text?: ReactNode; children: ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  if (!text) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-64">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
