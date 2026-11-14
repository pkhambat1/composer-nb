// Shared application constants
import { WELCOME_CELLS } from "./welcome.ts"
import type { SavedCell, Settings } from "./types.ts"

export const APP_CONSTANTS: {
  DOCS_URL: string
  DOUBLE_KEY_TIMEOUT: number
  THEME_DEFAULTS: Settings
  STARTER_CELLS: SavedCell[]
} = {
  // The docs site, built by Mintlify from the docs/ folder
  DOCS_URL: "https://pkhambat.mintlify.site",

  // Double-key press timeout (ms) for delete confirmation
  DOUBLE_KEY_TIMEOUT: 400,

  // How the playground looks until it's changed: light or dark, and how the hits are
  // drawn. The accent is the one colour everything else is tinted with.
  THEME_DEFAULTS: {
    theme: "light",
    accent: "#1a73e8",
    drumView: "bricks", // or sheet: the drums as sheet music
    sheetCounts: true, // counts are always shown on sheet music
  },

  // The notebook created for a new account.
  STARTER_CELLS: WELCOME_CELLS,
}
