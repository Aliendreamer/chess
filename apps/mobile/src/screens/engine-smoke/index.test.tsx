import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { EngineSmoke } from './index'
import type { UciChannel } from '@chess/local'

/** A channel that answers like Stockfish: the handshake, readyok, and a best move after `go`. */
function fakeChannel() {
  const sent: Array<string> = []
  let listener: (line: string) => void = () => {}
  const channel: UciChannel = {
    write: (line) => {
      sent.push(line)
      const say = (l: string) => queueMicrotask(() => listener(l))
      if (line === 'uci') say('uciok')
      else if (line === 'isready') say('readyok')
      else if (line.startsWith('go')) say('bestmove e2e4 ponder e7e5')
      return Promise.resolve()
    },
    onLine: (l) => void (listener = l),
    onExit: () => {},
    kill: () => Promise.resolve(),
  }
  return { channel, sent }
}

test('shows what the last run left, asks for a move, and offers the crash test', async () => {
  const { channel, sent } = fakeChannel()
  await render(
    <EngineSmoke
      open={() => Promise.resolve(channel)}
      left={{ crash: null, marker: { kind: 'board', fen: 'startpos' } }}
      now={() => 0}
    />,
  )
  expect(screen.getByTestId('left').props.children).toContain('marker')
  await fireEvent.press(screen.getByText('Ask for a move'))
  expect((await screen.findByTestId('answer')).props.children).toBe('e2e4 in 0 ms')
  await fireEvent.press(screen.getByText('Crash test'))
  await waitFor(() => expect(sent).toContain('# crash-test'))
})
