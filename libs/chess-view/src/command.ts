import { useState } from 'react'
import type { CommandOutcome } from '@chess/core'

export interface Command {
  busy: boolean
  error: string | null
  /** Runs one command: busy while it runs; a refusal becomes `error` and yields null. 5xx and 401 still throw. */
  run: <T>(call: () => Promise<CommandOutcome<T>>) => Promise<T | null>
}

/** The busy/error state every command button shares. */
export function useCommand(): Command {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run<T>(call: () => Promise<CommandOutcome<T>>): Promise<T | null> {
    setBusy(true)
    setError(null)
    try {
      const outcome = await call()
      if (outcome.ok) return outcome.view
      setError(outcome.error)
      return null
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}
