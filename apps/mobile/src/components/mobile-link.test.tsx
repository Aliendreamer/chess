import { Text } from 'react-native'
import { fireEvent, screen } from '@testing-library/react-native'
import { renderRouter } from 'expo-router/testing-library'
import { MobileLink } from './mobile-link'

test('a desktop path opens the screen under its tab, query and all', async () => {
  // React Native Testing Library 14 renders asynchronously: renderRouter's pathname helpers sit on the promise it
  // returns, so keep that and await it separately.
  const router = renderRouter(
    {
      index: () => <MobileLink to="/trainer/Italian%20Game?color=black">Italian Game</MobileLink>,
      'learn/trainer/[family]': () => <Text>trainer</Text>,
    },
    { initialUrl: '/' },
  )
  await router
  await fireEvent.press(screen.getByRole('link', { name: 'Italian Game' }))
  expect(router.getPathname()).toBe('/learn/trainer/Italian Game')
  expect(router.getSearchParams()).toEqual({ family: 'Italian Game', color: 'black' })
})
