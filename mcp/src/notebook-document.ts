import { z } from "zod"

export const notebookCellSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["music", "text"]),
  source: z.string(),
})
export const notebookSchema = z.object({
  id: z.string(),
  title: z.string(),
  revision: z.number().int().nonnegative(),
  cells: z.array(notebookCellSchema),
})
export type NotebookDocument = z.infer<typeof notebookSchema>
export type DocumentCell = z.infer<typeof notebookCellSchema>

export const notebookSummarySchema = notebookSchema.pick({ id: true, title: true, revision: true })
export type NotebookSummary = z.infer<typeof notebookSummarySchema>
export const notebookListSchema = z.object({
  notebooks: z.array(notebookSummarySchema),
  nextOffset: z.number().int().nonnegative().optional(),
})
export type NotebookList = z.infer<typeof notebookListSchema>

// What a write tells the assistant: where the change landed, without the notebook's source.
export const notebookChangeSchema = z.object({
  notebookId: z.string(),
  title: z.string(),
  revision: z.number().int().nonnegative(),
  cellCount: z.number().int().nonnegative(),
  cellId: z.string().optional(),
  cellNumber: z.number().int().positive().optional(),
  change: z.string().optional(),
  // What parse would say of the written cell. Hosts that hand the model structuredContent
  // alone (Claude Code does) drop the text content, so the report travels here too.
  report: z.string().optional(),
})
export type NotebookChange = z.infer<typeof notebookChangeSchema>
export const notebookRevisionSchema = notebookChangeSchema.pick({
  notebookId: true,
  revision: true,
})

// A tool result carries the whole notebook for the app under this _meta key, which hosts
// give to the app and keep out of the model's context. get_notebook, the model's own
// read, has it in structuredContent.
export const NOTEBOOK_META = "composer-nb/notebook"
// Marks an error result as a revision conflict, which the app merges and retries.
export const CONFLICT_META = "composer-nb/conflict"

type ToolResult = { structuredContent?: Record<string, unknown>; _meta?: Record<string, unknown> }
export function notebookOf(result: ToolResult): NotebookDocument | null {
  for (const value of [result._meta?.[NOTEBOOK_META], result.structuredContent?.notebook]) {
    const parsed = notebookSchema.safeParse(value)
    if (parsed.success) return parsed.data
  }
  return null
}
