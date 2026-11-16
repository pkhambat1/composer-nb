import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { notebookChangeSchema, notebookOf } from "../src/notebook-document.ts"

/** Hosts may omit app-only metadata. Resolve a summary with one bounded read, both
    for a model-delivered result and for a tool called by the sidebar itself. */
export async function notebookFromResult(
  result: CallToolResult,
  read: (notebookId: string) => Promise<CallToolResult>,
) {
  const check = (response: CallToolResult) => {
    if (response.isError)
      throw new Error(
        response.content
          .filter((item) => item.type === "text")
          .map((item) => item.text)
          .join("\n"),
      )
    return notebookOf(response)
  }
  const notebook = check(result)
  if (notebook) return notebook
  const change = notebookChangeSchema.safeParse(result.structuredContent)
  if (!change.success) return null
  const fetched = check(await read(change.data.notebookId))
  if (!fetched) throw new Error("The server returned an invalid notebook.")
  return fetched
}
