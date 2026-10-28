# composer-nb plugin

The [composer-nb](https://composer-nb.vercel.app) connector and four skills, as one Claude plugin. Claude writes drums, notes and chords as a cell, checks it against the parser and hands it back, playing in the chat where the client draws it.

| Skill         | For                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------- |
| `write-cells` | Any cell: the parse-and-fix workflow and the standard a cell is held to.                     |
| `groove`      | A drum groove from a description, starting from the grooves library.                         |
| `practice`    | A routine on a groove, riff or chart, written out as cells: a tempo ladder, or a play-along. |
| `theory`      | A theory idea as small cells you can hear, one idea a cell.                                  |

`.mcp.json` connects to `https://composer-nb.vercel.app/mcp`, which needs no sign-in. Install steps are in [Assistants](https://pkhambat.mintlify.site/assistants). Raise `version` in `.claude-plugin/plugin.json` when the skills change, so installed copies update.
