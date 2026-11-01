import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { STANDARD_START } from '@chess/core'
import { useMoveTree } from './dom.ts'

afterEach(cleanup)

describe('useMoveTree on the web (analysis-board)', () => {
  it('walks the line with the keyboard and flips with f', () => {
    const { result } = renderHook(() => useMoveTree(STANDARD_START, []))
    act(() => {
      result.current.onDrop('e2', 'e4')
    })
    act(() => {
      result.current.onDrop('e7', 'e5')
    })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    })
    expect(result.current.path).toEqual([0])
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }))
    })
    expect(result.current.orientation).toBe('black')
  })

  it('ignores keys typed in a field', () => {
    const { result } = renderHook(() => useMoveTree(STANDARD_START, []))
    act(() => {
      result.current.onDrop('e2', 'e4')
    })
    const input = document.createElement('input')
    document.body.append(input)
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    })
    expect(result.current.path).toEqual([0])
    input.remove()
  })
})
