import { Text } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { ServicesProvider, useServices } from './services-context'
import type { MobileServices } from './services'

function Shows() {
  const { crash } = useServices()
  return <Text testID="crash">{crash ? crash.signal : 'none'}</Text>
}

test('starts the services once and hands them to every screen', async () => {
  const services = {
    crash: { kind: 'review', fen: null, signal: 'SIGSEGV', at: 'now' },
    dispose: jest.fn(),
  } as unknown as MobileServices
  const start = jest.fn(() => Promise.resolve(services))
  await render(
    <ServicesProvider start={start}>
      <Shows />
    </ServicesProvider>,
  )
  expect((await screen.findByTestId('crash')).props.children).toBe('SIGSEGV')
  expect(start).toHaveBeenCalledTimes(1)
})

test('says when the app could not start, instead of a blank screen', async () => {
  await render(
    <ServicesProvider
      start={() => Promise.reject(new Error('The database is from a newer version of the app.'))}
    >
      <Shows />
    </ServicesProvider>,
  )
  expect(await screen.findByText(/newer version of the app/)).toBeTruthy()
})
