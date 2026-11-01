import { Stack } from 'expo-router'
import { startMobileServices } from '@/lib/app'
import { ServicesProvider } from '@/lib/services-context'

export default function RootLayout() {
  return (
    <ServicesProvider start={startMobileServices}>
      <Stack screenOptions={{ headerShown: false }} />
    </ServicesProvider>
  )
}
