import { Redirect } from 'expo-router'
import { STANDARD_START, findLevel } from '@chess/core'
import { Screen } from '@/components/screen'
import { useServices } from '@/lib/services-context'
import { EngineSmoke } from '@/screens/engine-smoke'

/** The engine check, in development builds only (mobile-app task 3.4), on the app's one Stockfish. */
export default function EngineCheck() {
  const services = useServices()
  if (!__DEV__) return <Redirect href="/" />
  return (
    <Screen title="Engine check">
      <EngineSmoke
        left={services.crash}
        bestMove={() => services.player.bestMove(STANDARD_START, findLevel('max')!, 1000)}
        crashTest={() => services.engine.run((engine) => engine.note('crash-test'))}
      />
    </Screen>
  )
}
