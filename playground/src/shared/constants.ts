// Shared application constants
import { grooveCells } from "composer-nb/grooves"
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
    sheetCounts: false, // count the hands' notes under the staff
  },

  // The notebook the playground opens with: a welcome text cell, then every groove in the
  // library (composer-nb/grooves): the transcriptions, the harmony cells and the rudiments,
  // each a text cell and its music cell.
  STARTER_CELLS: [
    {
      type: "text",
      source: `# A music notebook, in place of paper

Write what plays, hear it, and see it as bricks or as sheet music. A notebook is cells, like a page: text cells like this one, and music cells with a groove, a riff or a chord chart. Press **Play** on a cell (or Shift+Enter) to hear it. The language is small and the whole of it is under **Docs**.

What you write is kept on this device as you go: your notebooks are listed on the left, and a notebook's name opens its menu. Below are transcriptions, then harmony cells: a ii–V–I, a blues, and a walk through each mode, from lydian to locrian. Then the rudiments, with their stickings. Change anything and play it again.`,
    },
    ...grooveCells("Transcriptions"),
    ...grooveCells("Harmony"),
    ...grooveCells("Rudiments"),
  ],

}
