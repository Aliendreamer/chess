import { useState } from 'react'
import { Text, View } from 'react-native'
import { Link } from 'expo-router'
import { STANDARD_START, positionKey } from '@chess/core'
import { MIGRATIONS } from '@chess/local'
import { useMoveTree } from '@chess/view'
import { CrashNotice } from '@/components/crash-notice'
import { EngineStatus } from '@/components/engine-status'
import { useServices } from '@/lib/services-context'

/**
 * A placeholder home (mobile-app tasks 2.1, 4.4): the shared libraries at work, the crash notice after Stockfish
 * closed the app (D13) and the engine's state. The real screens replace it in group 5.
 */
export default function Home() {
  const services = useServices()
  const [notice, setNotice] = useState(services.crash)
  const editor = useMoveTree(STANDARD_START, [])
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {notice ? <CrashNotice notice={notice} onDismiss={() => setNotice(null)} /> : null}
      <EngineStatus engine={services.engine} />
      <Text testID="title">Chess</Text>
      <Text testID="start-key">{positionKey(STANDARD_START)}</Text>
      <Text testID="schema">{`Schema ${MIGRATIONS.length}`}</Text>
      <Text testID="side">{editor.orientation}</Text>
      {__DEV__ ? <Link href="/dev/engine">Engine check</Link> : null}
    </View>
  )
}
