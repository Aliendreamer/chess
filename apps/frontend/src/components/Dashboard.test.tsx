import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Dashboard } from './Dashboard'
import { Tile } from './Tile'

afterEach(cleanup)

const me = { id: 7, subject: 'sub-7', email: 'ann@chess.localhost', roles: ['Admin', 'User'] }

describe('Dashboard', () => {
  it('renders identity and live health from props — no loading state', () => {
    render(
      <Dashboard
        me={me}
        health={{
          data: { status: 'Healthy', checkedAt: '2026-09-21T10:00:00.000Z' },
          error: false,
        }}
      />,
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Hello, ann')
    expect(screen.getByTestId('me-subject').textContent).toContain('sub-7')
    expect(screen.getByTestId('health-status').textContent).toContain('Healthy')
    expect(screen.queryByText(/loading/i)).toBeNull()
  })

  it('degrades only the failing tile', () => {
    render(<Dashboard me={{ ...me, email: null }} health={{ data: null, error: true }} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Hello, sub-7')
    expect(screen.getByRole('status').textContent).toMatch(/unavailable/i)
    expect(screen.getByTestId('me-id').textContent).toContain('7')
  })
})

describe('Tile', () => {
  it('shows children when healthy', () => {
    render(
      <Tile title="T" error={false}>
        <p>content</p>
      </Tile>,
    )
    expect(screen.getByText('content')).toBeDefined()
  })
})
