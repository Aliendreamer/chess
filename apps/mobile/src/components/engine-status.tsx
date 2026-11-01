import { useEffect, useState } from 'react'
import { Text } from 'react-native'
import type { EngineStatus as State } from '@chess/local'

const SAID: Partial<Record<State, string>> = {
  restarting: 'Stockfish is restarting…',
  stuck: 'Stockfish stopped responding. Close and reopen the app; your games are saved.',
}

/** The engine's state where it matters to the player (mobile-app D13): restarting, or stuck until the app reopens. */
export function EngineStatus({
  engine,
}: {
  engine: { state: State; subscribe: (listener: (state: State) => void) => () => void }
}) {
  const [state, setState] = useState(engine.state)
  useEffect(() => engine.subscribe(setState), [engine])
  const text = SAID[state]
  return text ? (
    <Text testID="engine-status" accessibilityRole="alert">
      {text}
    </Text>
  ) : null
}
