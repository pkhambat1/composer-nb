/* Where the playground is, and its themes. The MCP server links the sheet and MIDI
   downloads from here. */

export const SITE = "https://composer-nb.vercel.app"
export const THEMES = ["light", "dark"] as const
export type Theme = (typeof THEMES)[number]
// Whether a value, from an address or a message, is one of the themes
export const isTheme = (value: unknown): value is Theme => THEMES.some((t) => t === value)
