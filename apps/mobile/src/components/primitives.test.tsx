import { Text } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { DEFAULT_PREFERENCES } from '@chess/core'
import { COLORS } from '../theme/tokens'
import { ThemeProvider } from '../theme/theme'
import { Button, EmptyState, Row, Section, Sheet } from './primitives'

const light = { ...DEFAULT_PREFERENCES, siteTheme: 'light' as const }

describe('Button', () => {
  test('presses', async () => {
    const onPress = jest.fn()
    await render(<Button label="New game" onPress={onPress} />)
    await fireEvent.press(screen.getByRole('button', { name: 'New game' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  test('a disabled one says so and does not press', async () => {
    const onPress = jest.fn()
    await render(<Button label="Resign" onPress={onPress} disabled />)
    const button = screen.getByRole('button', { name: 'Resign' })
    expect(button).toBeDisabled()
    await fireEvent.press(button)
    expect(onPress).not.toHaveBeenCalled()
  })

  test('the primary one is brass, with the Club colours by default', async () => {
    await render(<Button label="Continue" kind="primary" onPress={() => {}} />)
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveStyle({
      backgroundColor: COLORS.dark.accentFill,
    })
  })
})

describe('Row', () => {
  test('shows its value and presses', async () => {
    const onPress = jest.fn()
    await render(<Row label="Board" value="Brown" onPress={onPress} />)
    expect(screen.getByText('Brown')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Board, Brown' }))
    expect(onPress).toHaveBeenCalled()
  })

  test('without onPress it is plain text, not a button', async () => {
    await render(<Row label="Version" value="1.0.0" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  test('follows Parchment when the player picks it', async () => {
    await render(
      <ThemeProvider preferences={light}>
        <Row label="Board" value="Brown" />
      </ThemeProvider>,
    )
    expect(screen.getByText('Board')).toHaveStyle({ color: COLORS.light.fgPrimary })
  })
})

test('Section titles its rows', async () => {
  await render(
    <Section title="Your data">
      <Row label="Back up everything" onPress={() => {}} />
    </Section>,
  )
  expect(screen.getByRole('header', { name: 'Your data' })).toBeTruthy()
})

describe('Sheet', () => {
  test('shows nothing while closed', async () => {
    await render(
      <Sheet visible={false} title="New game" onClose={() => {}}>
        <Text>Level</Text>
      </Sheet>,
    )
    expect(screen.queryByText('Level')).toBeNull()
  })

  test('shows its title and content, and closes', async () => {
    const onClose = jest.fn()
    await render(
      <Sheet visible title="New game" onClose={onClose}>
        <Text>Level</Text>
      </Sheet>,
    )
    expect(screen.getByText('Level')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'New game' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })
})

test('EmptyState says what is missing and offers the way on', async () => {
  const onPress = jest.fn()
  await render(
    <EmptyState
      title="No studies yet"
      body="Import a PGN file or save one from the analysis board."
      action={{ label: 'Import PGN', onPress }}
    />,
  )
  expect(screen.getByText('No studies yet')).toBeTruthy()
  await fireEvent.press(screen.getByRole('button', { name: 'Import PGN' }))
  expect(onPress).toHaveBeenCalled()
})
