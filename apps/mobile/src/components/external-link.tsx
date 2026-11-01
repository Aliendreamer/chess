import { Text, type StyleProp, type TextStyle } from 'react-native'
import { useServices } from '@/lib/services-context'
import { useTheme } from '@/theme/theme'
import { FONTS, TEXT } from '@/theme/tokens'

/**
 * A link that opens in the phone's browser, never inside the app (chess-news: the article stays on its own site).
 * Inline in a sentence or on its own; named for a screen reader with the site it opens.
 */
export function ExternalLink({
  url,
  children,
  label,
  style,
}: {
  url: string
  children: string
  /** What a screen reader says, when the text alone is not enough. */
  label?: string
  style?: StyleProp<TextStyle>
}) {
  const { openLink } = useServices()
  const { colors } = useTheme()
  return (
    <Text
      accessibilityRole="link"
      accessibilityLabel={label ?? children}
      onPress={() => void openLink(url)}
      suppressHighlighting={false}
      style={[{ color: colors.fgAccent, fontFamily: FONTS.sans, fontSize: TEXT.sm.size }, style]}
    >
      {children}
    </Text>
  )
}
