import { createContext, use, useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import type { ReactNode } from 'react'
import type { MobileServices } from './services'

const ServicesContext = createContext<MobileServices | null>(null)

/** The app's services (src/lib/services.ts) for a screen; only inside {@link ServicesProvider}. */
export function useServices(): MobileServices {
  const services = use(ServicesContext)
  if (!services) throw new Error('useServices outside ServicesProvider')
  return services
}

/**
 * Starts the services once for the whole app and hands them to every screen; until they are ready the splash stays
 * (the root layout hides it), and a failure is said in words, the splash gone, rather than a blank screen.
 */
export function ServicesProvider({
  start,
  children,
}: {
  start: () => Promise<MobileServices>
  children: ReactNode
}) {
  const [services, setServices] = useState<MobileServices | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    let started: MobileServices | null = null
    start().then(
      (s) => {
        started = s
        if (live) setServices(s)
        else s.dispose()
      },
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      live = false
      started?.dispose()
    }
  }, [start])
  useEffect(() => {
    if (error) void SplashScreen.hideAsync()
  }, [error])
  if (error)
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text accessibilityRole="alert">{`The app could not start: ${error}`}</Text>
      </View>
    )
  if (!services)
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Starting…</Text>
      </View>
    )
  return <ServicesContext value={services}>{children}</ServicesContext>
}
