import { defaultClientConditions, defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  // The engine's source (dsl/src), not its build in dsl/lib, so an edit shows at once
  resolve: { conditions: ["composer-nb-source", ...defaultClientConditions] },
  server: {
    proxy: Object.fromEntries(
      [
        "/mcp",
        "/mcp-assets", // hashed renderer assets from the development server
        "/authorize",
        "/token",
        "/register",
        "/revoke",
        "/.well-known",
        "/oauth/request",
        "/oauth/decision",
        "/oauth/connections",
        "/oauth/disconnect",
      ].map((path) => [path, "http://127.0.0.1:4187"]),
    ),
  },
})
