import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * site-themes: body text must stay readable (WCAG AA, 4.5:1) on the page and card surfaces in both site themes. The
 * values are read from styles.css itself, so a palette edit that breaks contrast fails here.
 */
// vitest runs from the app's root (jsdom has no file: import.meta.url).
const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no ${selector} block`)
  const body = css.slice(start, css.indexOf('\n}', start))
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]))
}

const theme = block('@theme')
const light = { ...theme, ...block("[data-theme='light']") }

function resolve(tokens: Record<string, string>, name: string): string {
  const value = tokens[name]
  if (!value) throw new Error(`no ${name}`)
  const ref = /^var\((--[\w-]+)\)$/.exec(value.trim())
  return ref?.[1] ? resolve(tokens, ref[1]) : value
}

/** OKLCH → relative luminance (linear sRGB, clamped). */
function luminance(oklch: string): number {
  const m = /oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(oklch)
  if (!m) throw new Error(`not oklch: ${oklch}`)
  const [L, C, h] = [Number(m[1]), Number(m[2]), (Number(m[3]) * Math.PI) / 180]
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const clamp = (x: number) => Math.min(1, Math.max(0, x))
  const R = clamp(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s)
  const G = clamp(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s)
  const B = clamp(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s)
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

function contrast(tokens: Record<string, string>, fg: string, bg: string): number {
  const [x, y] = [luminance(resolve(tokens, fg)), luminance(resolve(tokens, bg))]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

describe.each([
  ['dark', theme],
  ['light', light],
])('the %s site theme', (_, tokens) => {
  it.each([
    ['--color-fg-primary', '--color-surface-page'],
    ['--color-fg-body', '--color-surface-page'],
    ['--color-fg-body', '--color-surface-card'],
    ['--color-fg-secondary', '--color-surface-card'],
    ['--color-fg-accent', '--color-surface-page'],
    ['--color-fg-on-accent', '--color-brass-400'],
  ])('%s on %s reads at 4.5:1 or better', (fg, bg) => {
    expect(contrast(tokens, fg, bg)).toBeGreaterThanOrEqual(4.5)
  })
})
