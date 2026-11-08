import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** Unisce le classi Tailwind (quelle dopo vincono su quelle prima). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
