import type { ReactNode } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Brand } from "@/components/brand"

/** Riquadro centrato delle pagine di accesso e cambio password. */
export function AuthCard({ title, description, children }: { title?: string; description: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4 pt-[max(1rem,env(safe-area-inset-top))] dark:bg-background">
      <Brand className="text-2xl" />
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  )
}
