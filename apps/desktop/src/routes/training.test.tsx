import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { fakeServices, renderApp } from '#/testing'

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList
})
const services: Array<{ close: () => void }> = []
afterEach(() => {
  cleanup()
  services.splice(0).forEach((s) => s.close())
})

describe('training (desktop-app)', () => {
  it('says the pool of your games is empty until a review finds a mistake', async () => {
    const s = await fakeServices()
    services.push(s)
    await renderApp('/training', s)
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }))
    expect((await screen.findByTestId('training-empty')).textContent).toContain(
      'No mistakes to train yet.',
    )
  })
})
