/* Mintlify's sandbox consumes JSX. The checked TSX file is the only authored source. */
import { readFile, writeFile } from "node:fs/promises"
import ts from "typescript"

const source = await readFile(new URL("../src/docs/Cell.tsx", import.meta.url), "utf8")
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.Preserve,
  },
})
const generated = `// Generated from playground/src/docs/Cell.tsx. Run npm run docs-cell -w playground.\n${outputText}`
const target = new URL("../../docs/snippets/cell.jsx", import.meta.url)
if (process.argv.includes("--check")) {
  if ((await readFile(target, "utf8")) !== generated)
    throw new Error("The Mintlify cell snippet needs regenerating: npm run docs-cell -w playground")
} else await writeFile(target, generated)
