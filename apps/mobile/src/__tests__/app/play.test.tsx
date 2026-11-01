import { fireEvent, render, screen } from '@testing-library/react-native'
import Home from '@/app/index'
import { ServicesProvider } from '@/lib/services-context'
import type { MobileServices } from '@/lib/services'

function services(crash: MobileServices['crash']): () => Promise<MobileServices> {
  const s = {
    crash,
    engine: { state: 'ready', subscribe: () => () => undefined },
    dispose: () => undefined,
  } as unknown as MobileServices
  return () => Promise.resolve(s)
}

test('the placeholder home shows the shared libraries at work', async () => {
  await render(
    <ServicesProvider start={services(null)}>
      <Home />
    </ServicesProvider>,
  )
  expect((await screen.findByTestId('title')).props.children).toBe('Chess')
  expect(screen.getByTestId('start-key').props.children).toBe(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
  )
  expect(screen.getByTestId('schema').props.children).toBe('Schema 2')
  expect(screen.getByTestId('side').props.children).toBe('white')
  expect(screen.queryByText(/Stockfish crashed/)).toBeNull()
})

test('after a crash, home says so until the player closes the notice', async () => {
  await render(
    <ServicesProvider start={services({ kind: 'review', fen: null, signal: 'SIGSEGV', at: 'now' })}>
      <Home />
    </ServicesProvider>,
  )
  expect(await screen.findByText(/Stockfish crashed and the app had to close/)).toBeTruthy()
  await fireEvent.press(screen.getByText('Close'))
  expect(screen.queryByText(/Stockfish crashed/)).toBeNull()
})
