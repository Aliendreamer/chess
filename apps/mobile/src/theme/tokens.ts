import { Platform } from 'react-native'
import type { BoardTheme, SiteTheme } from '@chess/core'

/**
 * The Club design for the phone (mobile-app D2): `@chess/ui`'s theme.css in React Native's terms. Colours are hex (no
 * oklch() in React Native), sizes are numbers; `tokens.test.ts` converts theme.css and fails on any drift, so change a
 * value there first, then here.
 */

const dark = {
  surfacePage: '#120f0c',
  surfaceRail: '#0d0b08',
  surfaceCard: '#17130f',
  surfaceRaised: '#191511',
  surfaceHover: '#1e1a16',
  surfaceSelected: '#231e19',
  surfaceInset: '#0d0b08',
  surfaceAccentTint: '#22190a',
  surfaceAccentSoft: '#1b150b',
  surfaceCurrent: '#382c15',
  lineDivider: '#25211d',
  lineDefault: '#2d2823',
  lineStrong: '#322d27',
  lineAccent: '#e0b771',
  lineAccentSoft: '#785f32',
  fgPrimary: '#efeae2',
  fgBody: '#c4bdb3',
  fgSecondary: '#a49d94',
  fgMuted: '#8c857c',
  fgAccent: '#e0b771',
  fgOnAccent: '#120f0c',
  statusWin: '#83d494',
  statusLoss: '#e87a69',
  statusDraw: '#a49d94',
  statusHealthy: '#83d494',
  statusTurn: '#e0b771',
  statusWaiting: '#8c857c',
  tcBullet: '#f66e60',
  tcBlitz: '#f2af48',
  tcRapid: '#68ca80',
  tcClassical: '#5eaceb',
  tcComputer: '#97a7b7',
  /** The primary button's fill (`--color-brass-400`), under `fgOnAccent`. */
  accentFill: '#e0b771',
}

export type Colors = typeof dark

/** Club dark (the default) and Parchment light, as `[data-theme='light']` redefines the semantic colours. */
export const COLORS: Record<SiteTheme, Colors> = {
  dark,
  light: {
    surfacePage: '#f8f5ef',
    surfaceRail: '#efeae2',
    surfaceCard: '#fcfaf6',
    surfaceRaised: '#f2eee7',
    surfaceHover: '#e9e4dc',
    surfaceSelected: '#e0dad0',
    surfaceInset: '#ebe7e1',
    surfaceAccentTint: '#eddcb9',
    surfaceAccentSoft: '#f6ead1',
    surfaceCurrent: '#ead5ab',
    lineDivider: '#dcd6cf',
    lineDefault: '#cdc6bd',
    lineStrong: '#b4ada4',
    lineAccent: '#90692f',
    lineAccentSoft: '#bca072',
    fgPrimary: '#191511',
    fgBody: '#322d27',
    fgSecondary: '#534c44',
    fgMuted: '#69625a',
    fgAccent: '#785214',
    fgOnAccent: '#120f0c',
    statusWin: '#137738',
    statusLoss: '#b2392b',
    statusDraw: '#5a544c',
    statusHealthy: '#137738',
    statusTurn: '#785214',
    statusWaiting: '#68625a',
    tcBullet: '#c83b32',
    tcBlitz: '#bb7400',
    tcRapid: '#1c8742',
    tcClassical: '#036eae',
    tcComputer: '#576574',
    accentFill: '#e0b771',
  },
}

/** The theme.css variable a colour comes from. */
export function colorVar(name: keyof Colors): string {
  if (name === 'accentFill') return '--color-brass-400'
  return `--color-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
}

/** Font sizes and line heights in points (`--text-*`; the line height is the CSS ratio times the size, rounded). */
export const TEXT = {
  'display-xl': { size: 44, lineHeight: 46 },
  'display-lg': { size: 40, lineHeight: 42 },
  'display-md': { size: 30, lineHeight: 32 },
  'display-sm': { size: 28, lineHeight: 28 },
  'display-xs': { size: 22, lineHeight: 23 },
  note: { size: 17, lineHeight: 24 },
  base: { size: 14, lineHeight: 20 },
  sm: { size: 13, lineHeight: 19 },
  xs: { size: 12, lineHeight: 17 },
  '2xs': { size: 11, lineHeight: 15 },
  clock: { size: 28, lineHeight: 34 },
} as const

export const RADIUS = { board: 4, control: 6, card: 8, count: 10, pill: 16 } as const

/** `--tracking-eyebrow` (0.08em) at the eyebrow's 11 pt. */
export const EYEBROW_TRACKING = 0.88

/**
 * The fonts `app.config.ts` embeds. Android names a font by its file, iOS by its PostScript name (read from each file's
 * name table). React Native picks no weight from a family, so each weight is its own name.
 */
const font = (android: string, ios: string) => Platform.select({ android, default: ios })
export const FONTS = {
  sans: font('IBMPlexSans_400Regular', 'IBMPlexSans-Regular'),
  sansMedium: font('IBMPlexSans_500Medium', 'IBMPlexSans-Medium'),
  sansSemiBold: font('IBMPlexSans_600SemiBold', 'IBMPlexSans-SemiBold'),
  mono: font('IBMPlexMono_400Regular', 'IBMPlexMono-Regular'),
  monoMedium: font('IBMPlexMono_500Medium', 'IBMPlexMono-Medium'),
  display: font('Newsreader_400Regular', 'Newsreader-Regular'),
  displayMedium: font('Newsreader_500Medium', 'Newsreader-Medium'),
  displayItalic: font('Newsreader_400Regular_Italic', 'Newsreader-Italic'),
}

export interface BoardColors {
  light: string
  dark: string
  /** The last move's squares, translucent over either square colour. */
  last: string
  selected: string
  target: string
  premove: string
  circle: string
}

const HIGHLIGHTS = {
  last: 'rgba(155, 199, 0, 0.41)',
  selected: 'rgba(20, 85, 30, 0.5)',
  target: 'rgba(20, 85, 30, 0.5)',
  premove: 'rgba(20, 30, 85, 0.4)',
  circle: 'rgba(21, 120, 27, 0.8)',
}

/** The board themes (lichess's flat ones), as `:root` and each `[data-board]` set them. */
export const BOARDS: Record<BoardTheme, BoardColors> = {
  brown: { ...HIGHLIGHTS, light: '#f0d9b5', dark: '#b58863' },
  blue: { ...HIGHLIGHTS, light: '#dee3e6', dark: '#8ca2ad' },
  green: { ...HIGHLIGHTS, light: '#ffffdd', dark: '#86a666' },
  slate: {
    ...HIGHLIGHTS,
    light: '#c9cfd6',
    dark: '#5d6b7a',
    last: 'rgba(120, 190, 255, 0.38)',
    selected: 'rgba(40, 110, 190, 0.5)',
  },
  walnut: {
    ...HIGHLIGHTS,
    light: '#ead6b0',
    dark: '#9a6a44',
    last: 'rgba(214, 170, 60, 0.55)',
    selected: 'rgba(214, 170, 60, 0.7)',
  },
}
