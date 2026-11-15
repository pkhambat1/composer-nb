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
export const notebookListSchema = z.object({
  notebooks: z.array(notebookSummarySchema),
  nextOffset: z.number().int().nonnegative().optional(),
})
export type NotebookList = z.infer<typeof notebookListSchema>
