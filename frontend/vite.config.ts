import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// Quattro pagine (principale, amministrazione, accesso, cambio password), compilate in dist/ e incorporate nel server.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    rollupOptions: {
      input: {
        index: path.resolve(import.meta.dirname, "index.html"),
        admin: path.resolve(import.meta.dirname, "admin.html"),
        login: path.resolve(import.meta.dirname, "login.html"),
        password: path.resolve(import.meta.dirname, "password.html"),
      },
    },
  },
})
