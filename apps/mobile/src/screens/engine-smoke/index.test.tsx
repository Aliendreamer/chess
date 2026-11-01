import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { EngineSmoke } from './index'

test('shows what the last run left, asks for a move, and offers the crash test', async () => {
  const crashTest = jest.fn(() => Promise.resolve())
  await render(
    <EngineSmoke
      left={{ kind: 'review', fen: 'startpos', signal: 'SIGSEGV', at: '2026-11-01T10:00:00.000Z' }}
      bestMove={() => Promise.resolve('e2e4')}
      crashTest={crashTest}
      now={() => 0}
    />,
  )
  expect(screen.getByTestId('left').props.children).toBe('Last run: crash SIGSEGV during review')
  await fireEvent.press(screen.getByText('Ask for a move'))
  expect((await screen.findByTestId('answer')).props.children).toBe('e2e4 in 0 ms')
  await fireEvent.press(screen.getByText('Crash test'))
  await waitFor(() => expect(crashTest).toHaveBeenCalled())
})
