# composer-nb: the language

The parser, the chord builder and the audio engine, in TypeScript (`js/`). The playground
(`playground/`) and the MCP server (`mcp/`) both run it, so they always parse a cell the
same way. It isn't published: it's a workspace package, imported by subpath, such as
`composer-nb/language`, `composer-nb/sheet` and `composer-nb/engine` (the list is
`exports` in `package.json`).

The language itself is documented on the [docs site](https://pkhambat.mintlify.site),
from [`docs/`](../docs).

## Working on it

From the repository root:

```bash
npm test -w dsl          # the language's tests
npm run typecheck -w dsl
npm run build -w dsl     # compiles js/ into lib/, which the Vercel functions run
```

Everything else in the repository reads `js/` directly, through the `composer-nb-source`
export condition. `tests/js/corpus/` holds what every real cell (the docs examples, the
grooves, the plugin's skill examples) plays: a change to the engine that changes it fails
`npm test`, and `npx vitest run -u` in `dsl/` rewrites it for a change that's meant.
