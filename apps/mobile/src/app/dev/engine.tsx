import { useState } from 'react'
import { Redirect } from 'expo-router'
import { EngineSmoke } from '@/screens/engine-smoke'
import { nativeChannel, takeCrashFiles } from '@/platform/engine'

/** The engine check, in development builds only (mobile-app task 3.4). */
export default function EngineCheck() {
  const [left] = useState(() => (__DEV__ ? takeCrashFiles() : { crash: null, marker: null }))
  if (!__DEV__) return <Redirect href="/" />
  return <EngineSmoke open={() => nativeChannel()} left={left} />
}
