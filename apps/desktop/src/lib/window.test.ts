import { describe, expect, it } from 'vitest'
import { MIN_WINDOW, nextWindowSize } from './window'

const SCREEN = { width: 1920, height: 1080 }

describe('the window size on demand', () => {
  it('grows and shrinks by a tenth', () => {
    expect(nextWindowSize({ width: 1000, height: 700 }, 'grow', SCREEN)).toEqual({
      width: 1100,
      height: 770,
    })
    expect(nextWindowSize({ width: 1100, height: 770 }, 'shrink', SCREEN)).toEqual({
      width: 1000,
      height: 700,
    })
  })

  it('stays on the screen and never below the smallest window', () => {
    expect(nextWindowSize({ width: 1900, height: 1000 }, 'grow', SCREEN)).toEqual(SCREEN)
    expect(nextWindowSize({ width: 820, height: 610 }, 'shrink', SCREEN)).toEqual(MIN_WINDOW)
    // A screen smaller than the smallest window: the smallest window.
    expect(
      nextWindowSize({ width: 800, height: 600 }, 'grow', { width: 700, height: 500 }),
    ).toEqual(MIN_WINDOW)
  })
})
