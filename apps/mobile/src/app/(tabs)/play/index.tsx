import { useState } from 'react'
import { useRouter } from 'expo-router'
import { CrashNotice } from '@/components/crash-notice'
import { EngineStatus } from '@/components/engine-status'
import { Row, Section } from '@/components/primitives'
import { Screen } from '@/components/screen'
import { useServices } from '@/lib/services-context'

/**
 * The Play tab's home: the crash notice after Stockfish closed the app (D13) and the engine's state. New game, the game
 * list and the game itself come with mobile-app 5.5.
 */
export default function PlayHome() {
  const services = useServices()
  const router = useRouter()
  const [notice, setNotice] = useState(services.crash)
  return (
    <Screen title="Play">
      {notice ? <CrashNotice notice={notice} onDismiss={() => setNotice(null)} /> : null}
      <EngineStatus engine={services.engine} />
      {__DEV__ ? (
        <Section title="Development">
          <Row label="Engine check" onPress={() => router.push('/dev/engine')} />
        </Section>
      ) : null}
    </Screen>
  )
}
