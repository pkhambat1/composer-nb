# composer-nb plugin

The [composer-nb](https://composer-nb.vercel.app) connector and four skills, as a plugin for ChatGPT and other MCP hosts. Your assistant writes drums, notes and chords as a cell, checks it against the parser and hands it back, playing in the chat where the client draws it.

| Skill         | For                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------- |
| `write-cells` | Any cell: the parse-and-fix workflow and the standard a cell is held to.                     |
| `groove`      | A drum groove from a description, starting from the grooves library.                         |
| `practice`    | A routine on a groove, riff or chart, written out as cells: a tempo ladder, or a play-along. |
| `theory`      | A theory idea as small cells you can hear, one idea a cell.                                  |

The portable `plugin.json` and `mcp.json` package points at
`https://composer-nb.vercel.app/mcp` with required OAuth authentication. All hosted music
and notebook tools require linking a Composer.nb account.
The `.claude-plugin/plugin.json` and `.mcp.json` files retain Claude compatibility.

After the account backend is deployed:

1. In ChatGPT, add a custom MCP server using the URL above. Select OAuth
   authentication, with dynamic client registration and public-client
   authentication (`none`) where the client offers that setting.
2. Sign in on Composer.nb and approve access, then ask “Open my composer-nb notebooks.”
3. Pick a notebook, select a cell, and ask for an edit in the host's chat. The
   website and plugin save to the same notebook. A request to make music adds a
   saved cell to the selected/named notebook, or creates a descriptively named
   notebook when none is selected. The assistant announces where it will write
   and confirms the notebook and cell saved. Edits are explicit and autosaved.
4. Manage or revoke access through **Connected apps** in the website account menu.

Other MCP hosts can connect to the same endpoint using standard OAuth discovery,
DCR and PKCE. Hosts supporting MCP Apps render the notebook; tool-only clients can
still list, read, create and edit notebooks.

For directory distribution, submit the deployed HTTPS server and package through
the host's publishing process. Supply actual privacy/support information and a
review account; this repository does not invent or publish those on your behalf.
Deployment variables, migrations and testing instructions are in
[the MCP README](../mcp/README.md). Local implementation does not mean the hosted
endpoint or directory listing has been updated.

Install steps are in [Assistants](https://pkhambat.mintlify.site/assistants). Raise `version` in `.claude-plugin/plugin.json` when the skills change, so installed copies update.
