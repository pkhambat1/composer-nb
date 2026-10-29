import { defaultClientConditions, defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  // The engine's source (dsl/js), not its build in dsl/lib, so an edit shows at once
  resolve: { conditions: ["composer-nb-source", ...defaultClientConditions] },
})
