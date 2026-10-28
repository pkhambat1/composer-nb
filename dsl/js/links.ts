/* Where the playground is, and the themes its frames take. The docs site and the groove
   pages embed it as a single cell in a frame (playground/src/shared/embed.ts), and the MCP
   server links its groove pages and its sheet and MIDI downloads from here. */

export const SITE = "https://composer-nb.vercel.app"
export const THEMES = ["light", "dark"] as const
export type Theme = (typeof THEMES)[number]
// Whether a value, from an address or a message, is one of the themes
export const isTheme = (value: unknown): value is Theme => THEMES.some((t) => t === value)
