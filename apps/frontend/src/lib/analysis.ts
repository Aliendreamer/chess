import { useEffect, useRef, useState } from 'react'
import { positionKey, remember } from '@chess/core'
import type { CommandOutcome, Evaluation, Think } from '@chess/core'

/**
 * Engine analysis on the study board (engine-analysis D5): the wire shapes of `POST /api/analysis`, the pure rules the
 * panel shows them with, and the hook that asks and polls. One position at a time: the one on the board. Client-safe.
 * Evaluations are shared by everyone (D1), so a position someone else analysed is answered at once.
 */

/** How often the board asks again while the engine is still working on the position. */
export const POLL_MS = 1500

/** `POST /api/analysis`: the position, with its evaluation once one at this think time or longer is known. */
export interface AnalysisView {
  key: string
  fen: string
  think: Think
  thinkMs: number
  evaluation: Evaluation | null
}

export interface Analysis {
  think: Think
  setThink: (think: Think) => void
  /** The best evaluation known for a position, at any think time. */
  evaluationOf: (fen: string) => Evaluation | null
  /** Asks for this position at the chosen think time; the board polls until it is known. */
  analyse: (fen: string) => void
  /** The engine is working on the position asked for. */
  thinking: boolean
  error: string | null
}

/**
 * Asks, then polls every {@link POLL_MS} until the evaluation is there or the page leaves. Asking for another position
 * replaces the one being waited for; evaluations already known stay (they score the move tree).
 */
export function useAnalysis(
  request: (input: { fen: string; think: Think }) => Promise<CommandOutcome<AnalysisView>>,
): Analysis {
  const [think, setThink] = useState<Think>('normal')
  const [known, setKnown] = useState<ReadonlyMap<string, Evaluation>>(new Map())
  const [waiting, setWaiting] = useState<{ fen: string; think: Think; gen: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)

  async function ask(fen: string, at: Think, gen: number) {
    try {
      const outcome = await request({ fen, think: at })
      if (gen !== generation.current) return
      if (!outcome.ok) {
        setError(outcome.error)
        setWaiting(null)
        return
      }
      setKnown((k) => remember(k, outcome.view))
      setWaiting(outcome.view.evaluation ? null : { fen, think: at, gen })
    } catch (e) {
      if (gen !== generation.current) return
      setError(e instanceof Error ? e.message : 'The analysis failed.')
      setWaiting(null)
    }
  }

  // Each answer without an evaluation sets a new `waiting`, which schedules the next ask.
  useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(() => void ask(waiting.fen, waiting.think, waiting.gen), POLL_MS)
    return () => clearTimeout(timer)
  }, [waiting])

  return {
    think,
    setThink,
    evaluationOf: (fen) => known.get(positionKey(fen)) ?? null,
    analyse: (fen) => {
      const gen = ++generation.current
      setError(null)
      setWaiting({ fen, think, gen })
      void ask(fen, think, gen)
    },
    thinking: waiting !== null,
    error,
  }
}
