import { defineConfig } from "vite"

// Two builds of the same player, each a single ES module with everything — Tone.js
// included — in one file:
//   vite build             the Jupyter widget, into the Python package, which ships it
//                          and its CSS in the wheel. anywidget loads the module on its own.
//   vite build --mode npm  the JavaScript library, into dist/ for npm, with the CSS inside
//                          the module, so a notebook can import it from a CDN by one URL.
export default defineConfig(({ mode }) => {
  const npm = mode === "npm"
  return {
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      outDir: npm ? "dist" : "python/composer_nb/static",
      emptyOutDir: true,
      lib: {
        entry: npm ? "js/music.js" : "js/widget/index.js",
        formats: ["es"],
        fileName: () => (npm ? "composer-nb.js" : "widget.js"),
        cssFileName: "widget",
      },
      rollupOptions: {
        output: { inlineDynamicImports: true },
      },
    },
  }
})
