import { useEffect } from 'react'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { startMobileServices } from '@/lib/app'
import { PreferencesProvider } from '@/lib/preferences'
import { ServicesProvider } from '@/lib/services-context'
import { useTheme } from '@/theme/theme'

// The splash stays over the start (the database, the preferences) and fades when the first page is there.
void SplashScreen.preventAutoHideAsync()
SplashScreen.setOptions({ fade: true, duration: 250 })

function Screens() {
  const { colors } = useTheme()
  useEffect(() => {
    void SplashScreen.hideAsync()
  }, [])
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
