import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// The MCP App's script: main.js and everything it uses (the playground's App, React,
// Tone.js, abcjs, the host client) as one ES module in dist/app.js, which mcp/app.js puts inline in the HTML
// the host loads. `npm run build:app -w mcp` builds it; `npm run dev:app -w mcp` serves
// index.html for a look at the player in a browser, outside a host.
const { version } = createRequire(import.meta.url)("../package.json")
const here = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  root: here,
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __VERSION__: JSON.stringify(version),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: "main.js",
      formats: ["es"],
      fileName: () => "app.js",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
