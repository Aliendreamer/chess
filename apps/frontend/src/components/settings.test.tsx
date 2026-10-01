import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsForm } from './settings'
import { DEFAULT_PREFERENCES } from '#/lib/auth'

afterEach(cleanup)

describe('SettingsForm', () => {
  it('marks the saved choices and previews the board in the chosen theme', () => {
    render(
      <SettingsForm
        prefs={{ ...DEFAULT_PREFERENCES, boardTheme: 'blue' }}
        error={null}
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Blue' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('settings-preview').getAttribute('data-board')).toBe('blue')
  })

  it('reports each change as a whole new set', () => {
    const onChange = vi.fn()
    render(<SettingsForm prefs={DEFAULT_PREFERENCES} error={null} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Club walnut' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_PREFERENCES, boardTheme: 'walnut' })

    fireEvent.click(screen.getByRole('button', { name: 'Fast' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_PREFERENCES, animation: 'fast' })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Coordinates' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_PREFERENCES, coordinates: false })

    fireEvent.click(screen.getByRole('button', { name: 'Light (Parchment)' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_PREFERENCES, siteTheme: 'light' })
  })

  it("shows the server's reason when a save is refused", () => {
    render(
      <SettingsForm
        prefs={DEFAULT_PREFERENCES}
        error="boardTheme must be one of …"
        onChange={() => {}}
      />,
    )
    expect(screen.getByTestId('settings-error').textContent).toContain('boardTheme')
  })
})
