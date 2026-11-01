import { StyleSheet } from 'react-native'
import { fireEvent, screen } from '@testing-library/react-native'
import { startServices, type MobileServices, type Platform } from '@/lib/services'
import { testPlatform } from './platform'

/**
 * The app's services for route tests: `jest.mock('@/lib/app', …)` hands the real layout {@link startTestServices}.
 * Node's SQLite, and an engine that plays the scripted answers, then none. A test that needs data before the first
 * screen starts the app with {@link startApp}, writes it, then renders: the layout takes those services.
 */
export interface TestApp {
  services: MobileServices
  shared: ReturnType<typeof testPlatform>['shared']
}

interface SetUp {
  /** The engine's moves, in turn; then it has none. */
  answers?: Array<string>
  platform?: Partial<Platform>
}

let ready: TestApp | null = null
let current: TestApp | null = null

/** Starts the services the next render takes. */
export async function startApp(setUp: SetUp = {}): Promise<TestApp> {
  const { p, shared } = testPlatform(setUp.platform)
  const services = await startServices(p)
  const answers = [...(setUp.answers ?? [])]
  services.player = { bestMove: () => Promise.resolve(answers.shift() ?? null) }
  ready = { services, shared }
  return ready
}

/** The app opened again on the same database: the next render takes these services. */
export function reopen(app: TestApp) {
  ready = app
}

/** The services the last render started (or took from {@link startApp}). */
export function testApp(): TestApp {
  if (!current) throw new Error('no app started')
  return current
}

export async function startTestServices(): Promise<MobileServices> {
  current = ready ?? (await startApp())
  ready = null
  return current.services
}

/** Taps a square of the board on screen, as a finger would: down and up at its centre. */
export async function tapSquare(square: string) {
  const board = screen.getByLabelText('Chess board')
  const { width } = StyleSheet.flatten(board.props.style) as { width: number }
  const cell = width / 8
  // The board names its squares in the order it shows them: where e2 is, flipped or not.
  const names = screen
    .getAllByLabelText(/^[a-h][1-8](,|$)/)
    .map((node) => String(node.props.accessibilityLabel).slice(0, 2))
  const index = names.indexOf(square)
  if (index < 0) throw new Error(`no square ${square} on the board`)
  const at = {
    locationX: (index % 8) * cell + cell / 2,
    locationY: Math.floor(index / 8) * cell + cell / 2,
  }
  await fireEvent(board, 'responderGrant', { nativeEvent: at })
  await fireEvent(board, 'responderRelease', { nativeEvent: at })
}
