import { defineConfig } from "vite"

// Builds the notebook widget into a single ES module (plus its CSS) inside the
// Python package, which ships both files in the wheel. anywidget loads the
// module on its own, so everything — Tone.js included — has to be in one file.
export default defineConfig({
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "python/composer_nb/static",
    emptyOutDir: true,
    lib: {
      entry: "js/widget/index.js",
      formats: ["es"],
      fileName: () => "widget.js",
      cssFileName: "widget",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
})
