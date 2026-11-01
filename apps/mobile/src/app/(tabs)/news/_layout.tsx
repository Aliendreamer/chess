import { Stack } from 'expo-router'
import { useTheme } from '@/theme/theme'

/** The tab's own stack: its pages open over its home, and back returns to it. */
export default function TabStack() {
  const { colors } = useTheme()
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surfacePage } }}
    />
  )
}
