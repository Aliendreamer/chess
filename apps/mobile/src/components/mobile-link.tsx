import type { ReactNode } from 'react'
import { Text, type StyleProp, type TextStyle } from 'react-native'
import { Link, type Href } from 'expo-router'
import { mobileRoute } from '../lib/links'
import { useTheme } from '../theme/theme'
import { FONTS, TEXT } from '../theme/tokens'

/**
 * A link between screens, written with the desktop's path (`/trainer/<family>?color=white`) as the shared components
 * write theirs; it opens the phone's screen under its tab (mobile-app D5). Brass text unless styled otherwise.
 */
export function MobileLink({
  to,
  children,
  style,
}: {
  to: string
  children: ReactNode
  style?: StyleProp<TextStyle>
}) {
  const { colors } = useTheme()
  return (
    <Link
      href={mobileRoute(to) as Href}
      style={[{ color: colors.fgAccent, fontFamily: FONTS.sans, fontSize: TEXT.base.size }, style]}
    >
      {typeof children === 'string' ? <Text>{children}</Text> : children}
    </Link>
  )
}
