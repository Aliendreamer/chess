import { Share } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { CrashNotice, crashReport } from './crash-notice'
import type { CrashNotice as Notice } from '@chess/local'

const GAME: Notice = {
  kind: 'game',
  fen: '8/8/8/8/8/8/8/K6k w - - 0 1',
  signal: 'SIGSEGV',
  at: '2026-11-01T10:00:00.000Z',
}

afterEach(() => jest.restoreAllMocks())

test('after a crash in a game: says so, everything saved, and the player chooses', async () => {
  const tryAgain = jest.fn()
  const takeBack = jest.fn()
  await render(<CrashNotice notice={GAME} onDismiss={() => {}} game={{ tryAgain, takeBack }} />)
  expect(screen.getByText(/Stockfish crashed and the app had to close/)).toBeTruthy()
  expect(screen.getByText(/while thinking about its move in your game/)).toBeTruthy()
  expect(screen.getByText(/Everything was saved/)).toBeTruthy()
  await fireEvent.press(screen.getByText('Take back my last move'))
  expect(takeBack).toHaveBeenCalled()
  await fireEvent.press(screen.getByText('Try again'))
  expect(tryAgain).toHaveBeenCalled()
})

test('a background crash names what it was doing and offers no choice', async () => {
  await render(<CrashNotice notice={{ ...GAME, kind: 'review' }} onDismiss={() => {}} />)
  expect(screen.getByText(/while reviewing a game/)).toBeTruthy()
  expect(screen.queryByText('Try again')).toBeNull()
})

test('the report is shared only when the player asks, with what helps find the fault', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' })
  await render(<CrashNotice notice={GAME} onDismiss={() => {}} />)
  expect(share).not.toHaveBeenCalled()
  await fireEvent.press(screen.getByText('Share a report'))
  const message = share.mock.calls[0]![0].message!
  expect(message).toContain('SIGSEGV')
  expect(message).toContain(GAME.fen)
  expect(message).toContain('Stockfish 19')
  expect(crashReport(GAME, { app: '1.2.3', os: 'android 34', model: 'Pixel 8' })).toContain(
    'Pixel 8',
  )
})
