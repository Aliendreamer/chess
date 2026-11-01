import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useCommand } from './command.ts'

describe('useCommand', () => {
  it('returns the view of an accepted command and clears the last error', async () => {
    const { result } = renderHook(() => useCommand())
    await act(async () => {
      await result.current.run(() =>
        Promise.resolve({ ok: false, status: 409, error: 'The game is over.' }),
      )
    })
    expect(result.current.error).toBe('The game is over.')

    let view: number | null = null
    await act(async () => {
      view = await result.current.run(() => Promise.resolve({ ok: true as const, view: 7 }))
    })
    expect(view).toBe(7)
    expect(result.current.error).toBeNull()
  })

  it('turns a refusal into its error and yields null', async () => {
    const { result } = renderHook(() => useCommand())
    let view: unknown = 'unset'
    await act(async () => {
      view = await result.current.run(() =>
        Promise.resolve({ ok: false, status: 422, error: 'Illegal move.' }),
      )
    })
    expect(view).toBeNull()
    expect(result.current.error).toBe('Illegal move.')
  })

  it('is busy while the command runs, and not after it throws', async () => {
    const { result } = renderHook(() => useCommand())
    let finish: (value: { ok: true; view: number }) => void = () => {}
    let running: Promise<number | null> = Promise.resolve(null)
    act(() => {
      running = result.current.run(() => new Promise((resolve) => (finish = resolve)))
    })
    expect(result.current.busy).toBe(true)
    await act(async () => {
      finish({ ok: true, view: 1 })
      await running
    })
    expect(result.current.busy).toBe(false)

    await act(async () => {
      await expect(result.current.run(() => Promise.reject(new Error('500')))).rejects.toThrow(
        '500',
      )
    })
    expect(result.current.busy).toBe(false)
  })
})
