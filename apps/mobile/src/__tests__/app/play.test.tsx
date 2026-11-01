import { fireEvent, render, screen } from '@testing-library/react-native'
import PlayHome from '@/app/(tabs)/play/index'
import { libraryProgress } from '@/lib/services'
import { ServicesProvider } from '@/lib/services-context'
import type { MobileServices } from '@/lib/services'

function services(crash: MobileServices['crash']): () => Promise<MobileServices> {
  const s = {
    crash,
    engine: { state: 'ready', subscribe: () => () => undefined },
    libraryProgress: libraryProgress(),
    dispose: () => undefined,
  } as unknown as MobileServices
  return () => Promise.resolve(s)
}

test('the Play tab opens with no notice when the last run went well', async () => {
  await render(
    <ServicesProvider start={services(null)}>
      <PlayHome />
    </ServicesProvider>,
  )
  expect(await screen.findByRole('header', { name: 'Play' })).toBeTruthy()
  expect(screen.queryByText(/Stockfish crashed/)).toBeNull()
})

test('after a crash, Play says so until the player closes the notice', async () => {
  await render(
    <ServicesProvider start={services({ kind: 'review', fen: null, signal: 'SIGSEGV', at: 'now' })}>
      <PlayHome />
    </ServicesProvider>,
  )
  expect(await screen.findByText(/Stockfish crashed and the app had to close/)).toBeTruthy()
  await fireEvent.press(screen.getByText('Close'))
  expect(screen.queryByText(/Stockfish crashed/)).toBeNull()
})
