import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { defaultClientConditions, defineConfig, transformWithEsbuild } from "vite"
import react from "@vitejs/plugin-react"
import { z } from "zod"

// Production entries are the portable MCP renderer and its small host bootstrap.
// app/dev is a separate development host and is excluded from these bundles.
const { version } = z
  .object({ version: z.string() })
  .parse(createRequire(import.meta.url)("../package.json"))
const here = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig(({ mode }) => ({
  root: here,
  plugins: [
    react(),
    {
      name: "compact-mcp-bundle",
      enforce: "post",
      renderChunk: (code) => transformWithEsbuild(code, "app.js", { minify: true }),
    },
    {
      name: "composer-development-host",
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (request.url === "/") request.url = "/dev/host.html"
          next()
        })
      },
    },
  ],
  server: { proxy: { "/mcp": "http://127.0.0.1:4179", "/widget": "http://127.0.0.1:4179" } },
  // The engine's source (dsl/js), not its build in dsl/lib
  resolve: { conditions: ["composer-nb-source", ...defaultClientConditions] },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __VERSION__: JSON.stringify(version),
  },
  build: {
    target: "es2022",
    minify: "esbuild",
    // The MCP App is a portable single-file bundle, so shared notebook textures must travel
    // inside app.js rather than depending on the website's public directory.
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    outDir: "dist",
    emptyOutDir: mode !== "bootstrap",
    lib: {
      entry: mode === "bootstrap" ? "bootstrap.ts" : "main.ts",
      formats: ["es"],
      fileName: () => (mode === "bootstrap" ? "bootstrap.js" : "app.js"),
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
}))
