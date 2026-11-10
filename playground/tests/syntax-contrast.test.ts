import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8")
const tokenNames = [
  "comment",
  "key",
  "value",
  "instrument",
  "name",
  "rhythm",
  "pitch",
  "pitch-detail",
  "faint",
  "rest",
] as const
const primaryTokenNames = [
  "key",
  "value",
  "instrument",
  "name",
  "rhythm",
  "pitch",
  "pitch-detail",
] as const

function themeVariables(source: string): Record<string, string> {
  return Object.fromEntries(
    [...source.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [match[1], match[2]]),
  )
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(foreground: string, background: string): number {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a,
  )
  return (values[0] + 0.05) / (values[1] + 0.05)
}

function errorBackground(source: string, background: string): string {
  const match = /--tk-error-bg:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(source)!
  const backdrop = background
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16))
  const alpha = Number(match[4])
  const mixed = [Number(match[1]), Number(match[2]), Number(match[3])].map((channel, index) =>
    Math.round(channel * alpha + backdrop[index] * (1 - alpha)),
  )
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

describe("syntax palette contrast", () => {
  const root = css.slice(css.indexOf(":root"), css.indexOf('[data-theme="dark"]'))
  const dark = css.slice(css.indexOf('[data-theme="dark"]'), css.indexOf("* {"))

  it.each([
    ["light", root, themeVariables(root)],
    ["dark", dark, { ...themeVariables(root), ...themeVariables(dark) }],
  ])("keeps every %s token at WCAG AA contrast", (_theme, source, variables) => {
    for (const name of tokenNames) {
      const ratio = contrast(variables[`tk-${name}`], variables["code-bg"])
      expect(ratio, `${name} has only ${ratio.toFixed(3)}:1 contrast`).toBeGreaterThanOrEqual(4.5)
    }

    const primaryRatios = primaryTokenNames.map((name) =>
      contrast(variables[`tk-${name}`], variables["code-bg"]),
    )
    expect(Math.max(...primaryRatios) - Math.min(...primaryRatios)).toBeLessThanOrEqual(0.3)

    const errorRatio = contrast(
      variables["tk-error"],
      errorBackground(source as string, variables["code-bg"]),
    )
    expect(errorRatio, `error has only ${errorRatio.toFixed(3)}:1 contrast`).toBeGreaterThanOrEqual(
      4.5,
    )
  })
})
