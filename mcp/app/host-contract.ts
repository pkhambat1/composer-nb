import type { App } from "@modelcontextprotocol/ext-apps"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

/** The small host bridge can initialize before downloading the music renderer. */
export type ConnectedHost = {
  app: App
  input?: Record<string, unknown>
  result?: CallToolResult
  onInput?: (input: Record<string, unknown> | undefined) => void
  onResult?: (result: CallToolResult) => void
  onContext?: (context: { theme?: string }) => void
}
declare global {
  interface Window {
    composerNotebookHost?: ConnectedHost
  }
}
