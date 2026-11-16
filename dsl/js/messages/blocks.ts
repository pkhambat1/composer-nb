/* What the engine says about what a pattern, a block or a play holds: its lines, and the
   patterns it plays. */

export const BLOCK_MESSAGES = {
  "block.secondLine": ({ name, where }: { name: string; where: string }) =>
    `${name} already has a line ${where}. To layer it, put its lines in a block: ${name}: { ... }`,
  "block.nothingToPlay": ({ where }: { where: string }) => `Nothing to play ${where}`,
  "block.playsItself": ({ name }: { name: string | undefined }) =>
    `${name} plays itself, so it would never end`,
  "block.playsOnce": ({ name }: { name: string }) =>
    `${name} is a block and plays once. Put its length in its declaration, or use a pattern to repeat.`,
  "block.empty": ({ name }: { name: string }) => `${name} has nothing to play`,
  "block.emptyAnon": ({ type }: { type: string }) => `This ${type} has nothing to play`,
} as const
