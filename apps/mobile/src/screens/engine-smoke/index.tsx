import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { CrashNotice } from '@chess/local'

/**
 * The development build's engine check (mobile-app task 3.4): what the last run left (D13), a move asked of the app's
 * one Stockfish with its time, and a crash test (a fault on the engine thread, compiled into development builds only).
 */
export function EngineSmoke({
  left,
  bestMove,
  crashTest,
  now = () => Date.now(),
}: {
  left: CrashNotice | null
  bestMove: () => Promise<string | null>
  crashTest: () => Promise<void>
  now?: () => number
}) {
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function ask() {
    try {
      const from = now()
      const move = await bestMove()
      setAnswer(`${move ?? 'none'} in ${now() - from} ms`)
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center' }}>
      <Text testID="left">
        {left
          ? `Last run: crash ${left.signal} during ${left.kind ?? 'nothing'}`
          : 'Last run: no crash'}
      </Text>
      <Pressable onPress={() => void ask()}>
        <Text>Ask for a move</Text>
      </Pressable>
      {answer ? <Text testID="answer">{answer}</Text> : null}
      {error ? <Text testID="error">{error}</Text> : null}
      <Pressable onPress={() => void crashTest()}>
        <Text>Crash test</Text>
      </Pressable>
    </View>
  )
}
