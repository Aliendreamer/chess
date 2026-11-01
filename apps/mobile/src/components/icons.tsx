import { memo } from 'react'
import type { ColorValue } from 'react-native'
import { SvgXml } from 'react-native-svg'

/**
 * The tab bar's icons: Lucide's (ISC licence, © Lucide Icons and Contributors), the ones the desktop's rail shows,
 * copied from lucide-react 1.47.0 as SVG text so the app needs no icon package. Drawn in `currentColor`.
 */
const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

export const ICONS = {
  swords: svg(
    '<path d="m13 19 6-6"/><path d="M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5"/><path d="m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="m5 14 4 4"/><path d="m5 21-2-2"/><path d="M7.5 16.5 4 20"/>',
  ),
  graduationCap: svg(
    '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  ),
  microscope: svg(
    '<path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0 0-14h-1"/><path d="M9 14h2"/><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z"/><path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/>',
  ),
  newspaper: svg(
    '<path d="M15 18h-5"/><path d="M18 14h-8"/><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="10" y="6" rx="1"/>',
  ),
  ellipsis: svg(
    '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  ),
} as const

export type IconName = keyof typeof ICONS

/** An icon; decorative, since the control it sits in carries the name. */
export const Icon = memo(function Icon({
  name,
  color,
  size = 24,
}: {
  name: IconName
  color: ColorValue
  size?: number
}) {
  return (
    <SvgXml
      xml={ICONS[name]}
      color={color}
      width={size}
      height={size}
      importantForAccessibility="no"
      accessibilityElementsHidden
    />
  )
})
