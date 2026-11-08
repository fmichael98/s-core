/* SApp — pagina principale: le sezioni dell'app (con l'isola in basso), le impostazioni. */

import { waitForServerRestarts } from "@/lib/api"
import { boot } from "@/lib/boot"
import { App } from "@/app/App"

waitForServerRestarts()
boot(<App />)
