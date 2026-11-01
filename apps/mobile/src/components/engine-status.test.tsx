import { act, render, screen } from '@testing-library/react-native'
import { EngineStatus } from './engine-status'
import type { EngineStatus as State } from '@chess/local'

function supervisor(initial: State) {
  let listener: (s: State) => void = () => {}
  return {
    engine: {
      state: initial,
      subscribe: (l: (s: State) => void) => ((listener = l), () => undefined),
    },
    set: (s: State) => listener(s),
  }
}

test('says nothing while the engine is fine, and asks to reopen the app once it is stuck', async () => {
  const s = supervisor('ready')
  await render(<EngineStatus engine={s.engine} />)
  expect(screen.queryByTestId('engine-status')).toBeNull()
  await act(async () => s.set('restarting'))
  expect(screen.getByTestId('engine-status').props.children).toBe('Stockfish is restarting…')
  await act(async () => s.set('stuck'))
  expect(screen.getByTestId('engine-status').props.children).toBe(
    'Stockfish stopped responding. Close and reopen the app; your games are saved.',
  )
})
