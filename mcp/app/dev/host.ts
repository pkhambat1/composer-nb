import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge"
import { notebookSchema } from "../../src/notebook-document.ts"

const frame = document.getElementById("notebook")
const context = document.getElementById("context")
const messages = document.getElementById("messages")
if (!(frame instanceof HTMLIFrameElement) || !context || !messages)
  throw new Error("Missing development host mounts")
const client = new Client({ name: "composer-development-host", version: "1" })
const bridge = new AppBridge(
  client,
  { name: "Composer development host", version: "1" },
  { serverTools: {}, message: {}, updateModelContext: {} },
)
let selectedId: string | null = null
bridge.onupdatemodelcontext = async ({ content }) => {
  const text =
    content
      ?.filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n") ?? ""
  context.textContent = text
  const jsonStart = text.indexOf("\n")
  try {
    const snapshot: unknown = JSON.parse(text.slice(jsonStart + 1))
    if (
      typeof snapshot === "object" &&
      snapshot !== null &&
      "selectedId" in snapshot &&
      typeof snapshot.selectedId === "string"
    )
      selectedId = snapshot.selectedId
  } catch {
    selectedId = null
  }
  return {}
}
const demoEdit = async (text: string) => {
  messages.textContent = text
  if (!selectedId) throw new Error("Select a cell first.")
  const read = CallToolResultSchema.parse(
    await client.callTool({ name: "get_notebook", arguments: {} }, CallToolResultSchema),
  )
  const notebook = notebookSchema.parse(read.structuredContent?.notebook)
  const edited = CallToolResultSchema.parse(
    await client.callTool(
      {
        name: "update_music_cell",
        arguments: {
          cellId: selectedId,
          expectedRevision: notebook.revision,
          source: "play {\n  kick: 1 3\n  snare: 2 4\n  hat: 1 2 3 4\n}",
        },
      },
      CallToolResultSchema,
    ),
  )
  messages.textContent += edited.isError
    ? "\n\nEdit rejected by the server."
    : "\n\nFixed example groove saved through the real MCP tool. In ChatGPT, its model composes the edit."
  return {}
}
bridge.onmessage = async ({ content }) =>
  demoEdit(
    content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n"),
  )
const requestForm = document.getElementById("request-form")
const requestInput = document.getElementById("request")
if (!(requestForm instanceof HTMLFormElement) || !(requestInput instanceof HTMLTextAreaElement))
  throw new Error("Missing development composer")
requestForm.onsubmit = (event) => {
  event.preventDefault()
  void demoEdit(requestInput.value).catch((error: unknown) => {
    messages.textContent = String(error)
  })
}
bridge.oninitialized = () => {
  void (async () => {
    await bridge.sendToolInput({ arguments: {} })
    const result = CallToolResultSchema.parse(
      await client.callTool({ name: "open_notebook", arguments: {} }, CallToolResultSchema),
    )
    await bridge.sendToolResult(result)
  })().catch((error: unknown) => {
    messages.textContent = String(error)
  })
}
await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", location.href)))
const target = frame.contentWindow
if (!target) throw new Error("Missing notebook frame")
await bridge.connect(new PostMessageTransport(target, target))
frame.src = "/widget"
