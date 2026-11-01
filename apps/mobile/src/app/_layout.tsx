import { Stack } from 'expo-router'
import { startMobileServices } from '@/lib/app'
import { PreferencesProvider } from '@/lib/preferences'
import { ServicesProvider } from '@/lib/services-context'
import { useTheme } from '@/theme/theme'

function Screens() {
  const { colors } = useTheme()
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surfacePage } }}
    />
  )
}

/** The services, then the player's preferences as the theme, then the tabs and the full-screen pages (D5). */
export default function RootLayout() {
  return (
    <ServicesProvider start={startMobileServices}>
      <PreferencesProvider>
        <Screens />
      </PreferencesProvider>
    </ServicesProvider>
  )
}
