import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BOARD_THEMES } from '@chess/core'
import { oklchToHex } from './oklch'
import { BOARDS, COLORS, RADIUS, TEXT, colorVar, type Colors } from './tokens'

/**
 * mobile-app D2: the app's tokens are the Club's, read from `@chess/ui`'s theme.css. React Native takes no oklch(), so
 * the app keeps hex; this test converts the CSS and fails on any colour, size or radius that differs.
 */
const css = readFileSync(join(__dirname, '../../../../libs/chess-ui/src/theme.css'), 'utf8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no ${selector} block`)
  const body = css.slice(start, css.indexOf('\n}', start))
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  )
}

const theme = block('@theme')
const sheets = {
  dark: theme,
  light: { ...theme, ...block("[data-theme='light']") },
}

function resolve(tokens: Record<string, string>, name: string): string {
  const value = tokens[name]
  if (!value) throw new Error(`no ${name}`)
  const ref = /^var\((--[\w-]+)\)$/.exec(value)
  return ref?.[1] ? resolve(tokens, ref[1]) : value
}

describe.each(['dark', 'light'] as const)('the %s colours', (scheme) => {
  test.each(Object.keys(COLORS[scheme]) as Array<keyof (typeof COLORS)['dark']>)(
    '%s matches theme.css',
    (name) => {
      expect(COLORS[scheme][name]).toBe(oklchToHex(resolve(sheets[scheme], colorVar(name))))
    },
  )

  test('carries every semantic colour theme.css has', () => {
    const semantic = Object.keys(sheets[scheme]).filter((key) =>
      /^--color-(surface|line|fg|status|tc)-/.test(key),
    )
    const ours = (Object.keys(COLORS[scheme]) as Array<keyof Colors>).map(colorVar)
    expect(semantic.filter((key) => !ours.includes(key))).toEqual([])
  })
})

test('the text sizes and line heights match theme.css', () => {
  for (const [name, { size, lineHeight }] of Object.entries(TEXT)) {
    expect(`${size}px`).toBe(theme[`--text-${name}`])
    const ratio = theme[`--text-${name}--line-height`]
    if (ratio) expect(lineHeight).toBe(Math.round(size * Number(ratio)))
  }
})

test('the radii match theme.css', () => {
  for (const [name, px] of Object.entries(RADIUS)) expect(`${px}px`).toBe(theme[`--radius-${name}`])
})

describe('the board themes', () => {
  const root = block(':root')
  test.each(BOARD_THEMES)('%s matches theme.css', (board) => {
    const own = board === 'brown' ? {} : block(`[data-board='${board}']`)
    const value = (key: string) => own[`--board-${key}`] ?? root[`--board-${key}`]
    expect(BOARDS[board]).toEqual({
      light: value('light'),
      dark: value('dark'),
      last: value('last'),
      selected: value('selected'),
      target: value('target'),
      premove: value('premove'),
      circle: value('circle'),
    })
  })
})

test('oklch converts as CSS does', () => {
  // The Club's page colour, as app.config.ts carries it for the splash.
  expect(oklchToHex('oklch(0.17 0.008 70)')).toBe('#120f0c')
  expect(oklchToHex('oklch(1 0 0)')).toBe('#ffffff')
  expect(oklchToHex('oklch(0 0 0)')).toBe('#000000')
})
