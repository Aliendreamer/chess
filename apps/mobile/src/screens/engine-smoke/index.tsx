import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { STANDARD_START, findLevel, levelOptions } from '@chess/core'
import { UciEngine } from '@chess/local'
import type { EngineCrashRecord, EngineRequestMarker, UciChannel } from '@chess/local'

/**
 * The development build's engine check (mobile-app task 3.4): what the last run left (D13), a move asked of Stockfish
 * from the start with its time, and a crash test (a fault on the engine thread, compiled into development builds only).
 */
export function EngineSmoke({
  open,
  left,
  now = () => Date.now(),
}: {
  open: () => Promise<UciChannel>
  left: { crash: EngineCrashRecord | null; marker: EngineRequestMarker | null }
  now?: () => number
}) {
  const [engine, setEngine] = useState<{ uci: UciEngine; channel: UciChannel } | null>(null)
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function started() {
    if (engine) return engine
    const channel = await open()
    const uci = new UciEngine(channel)
    await uci.initialize()
    const next = { uci, channel }
    setEngine(next)
    return next
  }

  async function ask() {
    try {
      const { uci } = await started()
      const from = now()
      const move = await uci.bestMove(STANDARD_START, levelOptions(findLevel('max')!), 1000)
      setAnswer(`${move ?? 'none'} in ${now() - from} ms`)
    } catch (e) {
      setError(String(e))
    }
  }

  async function crash() {
    const { channel } = await started()
    await channel.write('# crash-test')
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center' }}>
      <Text testID="left">
        {left.crash
          ? `Last run: crash ${left.crash.signal} during ${left.crash.request?.kind ?? 'nothing'}`
          : left.marker
            ? `Last run: ended during ${left.marker.kind} (marker only, no crash)`
            : 'Last run: nothing left'}
      </Text>
      <Pressable onPress={() => void ask()}>
        <Text>Ask for a move</Text>
      </Pressable>
      {answer ? <Text testID="answer">{answer}</Text> : null}
      {error ? <Text testID="error">{error}</Text> : null}
      <Pressable onPress={() => void crash()}>
        <Text>Crash test</Text>
      </Pressable>
    </View>
  )
}
