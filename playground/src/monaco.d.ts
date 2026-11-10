// Monaco's editor core without its languages: the same API as the package's main entry
declare module "monaco-editor/esm/vs/editor/edcore.main.js" {
  export * from "monaco-editor"
}

// Its worker, as Vite bundles it; declared here too for programs without Vite's types
// (the MCP server's tests compile the playground's components)
declare module "monaco-editor/esm/vs/editor/editor.worker.js?worker" {
  const EditorWorker: { new (): Worker }
  export default EditorWorker
}
