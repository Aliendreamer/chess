import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { STANDARD_START, playMove } from '@chess/core'
import { analysisTitle, studyByline, useMoveTree } from './studies-model.ts'
import type { StudyMove } from '@chess/core'

const m = (uci: string, san: string, children: Array<StudyMove> = []): StudyMove => ({
  uci,
  san,
  fen: `fen-${san}`,
  children,
})

/** 1.e4 e5 (1…c5) 2.Nf3 */
const tree: Array<StudyMove> = [
  m('e2e4', 'e4', [m('e7e5', 'e5', [m('g1f3', 'Nf3')]), m('c7c5', 'c5')]),
]

describe('studyByline (ui-polish)', () => {
  const study = { white: 'Anna', black: 'Bob', result: '1-0', ownerName: 'testuser' }

  it('names the players, the result and, for others, the owner', () => {
    expect(studyByline(study, true)).toBe('Anna – Bob · 1-0')
    expect(studyByline(study, false)).toBe('Anna – Bob · 1-0 · by testuser · read-only')
  })

  it('leaves out an unknown result and missing players', () => {
    expect(studyByline({ ...study, result: '*' }, true)).toBe('Anna – Bob')
    expect(studyByline({ white: null, black: null, result: null, ownerName: 'x' }, true)).toBe('')
  })
})

describe('useMoveTree (analysis-board)', () => {
  afterEach(cleanup)
  const PROMOTE = '8/4P3/8/8/8/8/k7/4K3 w - - 0 1'

  it('plays a dragged move into the tree and follows it', () => {
    const { result } = renderHook(() => useMoveTree(STANDARD_START, []))
    let ok = false
    act(() => {
      ok = result.current.onDrop('e2', 'e4')
    })
    expect(ok).toBe(true)
    expect(result.current.tree.map((move) => move.san)).toEqual(['e4'])
    expect(result.current.path).toEqual([0])
    expect(result.current.fen.split(' ')[1]).toBe('b')
  })

  it('refuses an illegal drop and asks before a promotion', () => {
    const { result } = renderHook(() => useMoveTree(PROMOTE, []))
    act(() => {
      expect(result.current.onDrop('e1', 'e3')).toBe(false)
    })
    expect(result.current.tree).toEqual([])
    act(() => {
      result.current.onDrop('e7', 'e8')
    })
    expect(result.current.promotion).toEqual({ from: 'e7', to: 'e8' })
    act(() => result.current.pickPromotion('q'))
    expect(result.current.tree[0]?.san).toBe('e8=Q')
    expect(result.current.promotion).toBeNull()
  })

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

  it('plays an engine line and can start again from another position', () => {
    const { result } = renderHook(() => useMoveTree(STANDARD_START, []))
    const e4 = playMove(STANDARD_START, 'e2e4')!
    act(() => result.current.playLine([e4, playMove(e4.fen, 'e7e5')!]))
    expect(result.current.tree.map((move) => move.san)).toEqual(['e4'])
    expect(result.current.path).toEqual([0, 0])
    act(() => result.current.reset(PROMOTE, []))
    expect(result.current.fen).toBe(PROMOTE)
    expect(result.current.path).toEqual([])
  })
})

describe('analysisTitle (analysis-board)', () => {
  it('names the study an analysis is saved as', () => {
    expect(analysisTitle()).toBe('Analysis')
    expect(analysisTitle({ white: 'Kasparov', black: 'Karpov' })).toBe(
      'Kasparov vs Karpov, analysis',
    )
  })
})
