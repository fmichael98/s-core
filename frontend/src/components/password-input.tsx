import { useState } from "react"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/** Campo password con l'occhio per mostrarla. */
export function PasswordInput({ className, eye = true, ...props }: React.ComponentProps<"input"> & { eye?: boolean }) {
  const [shown, setShown] = useState(false)
  const masked = !shown
  return (
    <div className="relative">
      <Input
        {...props}
        type={masked ? "password" : "text"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn(eye && "pr-10", className)}
      />
      {eye && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground hover:bg-transparent"
          onClick={() => setShown(!shown)}
          aria-label={shown ? "Nascondi password" : "Mostra password"}
          tabIndex={-1}
        >
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
      )}
    </div>
  )
}
