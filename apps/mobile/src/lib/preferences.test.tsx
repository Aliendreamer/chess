import { Pressable, Text } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { getPreferences, updatePreferences } from '@chess/local'
import { testPlatform } from '@/testing/platform'
import { useTheme } from '@/theme/theme'
import { COLORS } from '@/theme/tokens'
import { startServices, type MobileServices } from './services'
import { ServicesProvider } from './services-context'
import { PreferencesProvider, usePreferences } from './preferences'

function Probe() {
  const { colors } = useTheme()
  const { preferences, update } = usePreferences()
  return (
    <>
      <Text testID="page">{colors.surfacePage}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          void update({ siteTheme: preferences.siteTheme === 'dark' ? 'light' : 'dark' })
        }
      >
        <Text>Switch</Text>
      </Pressable>
    </>
  )
}

let services: MobileServices | null = null
afterEach(() => services?.dispose())

async function show(prepare: (s: MobileServices) => Promise<unknown> = () => Promise.resolve()) {
  const started = await startServices(testPlatform().p)
  services = started
  await prepare(started)
  await render(
    <ServicesProvider start={() => Promise.resolve(started)}>
      <PreferencesProvider>
        <Probe />
      </PreferencesProvider>
    </ServicesProvider>,
  )
  return started
}

test('the saved preferences theme everything below', async () => {
  await show((s) => updatePreferences(s.db, { siteTheme: 'light' }))
  expect((await screen.findByTestId('page')).props.children).toBe(COLORS.light.surfacePage)
})

test('a change shows at once and is kept', async () => {
  const s = await show()
  expect((await screen.findByTestId('page')).props.children).toBe(COLORS.dark.surfacePage)
  await fireEvent.press(screen.getByRole('button', { name: 'Switch' }))
  expect(screen.getByTestId('page').props.children).toBe(COLORS.light.surfacePage)
  expect((await getPreferences(s.db)).siteTheme).toBe('light')
})
