import { Text, View } from 'react-native'
import { Link } from 'expo-router'
import { STANDARD_START, positionKey } from '@chess/core'
import { MIGRATIONS } from '@chess/local'
import { useMoveTree } from '@chess/view'

/**
 * A placeholder home (mobile-app task 2.1): it proves the shared libraries bundle with Metro, the pure rules from
 * `@chess/core`, the data layer from `@chess/local`, and a hook from `@chess/view` (one React for the app and the
 * libraries). The real screens replace it in group 5.
 */
export default function Home() {
  const editor = useMoveTree(STANDARD_START, [])
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <Text testID="title">Chess</Text>
      <Text testID="start-key">{positionKey(STANDARD_START)}</Text>
      <Text testID="schema">{`Schema ${MIGRATIONS.length}`}</Text>
      <Text testID="side">{editor.orientation}</Text>
      {__DEV__ ? <Link href="/dev/engine">Engine check</Link> : null}
    </View>
  )
}
