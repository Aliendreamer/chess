import { EmptyState } from '@/components/primitives'
import { Screen } from '@/components/screen'

/** The More tab (mobile-app 5.10 brings settings, backup and About here). */
export default function More() {
  return (
    <Screen title="More">
      <EmptyState title="Coming next" body="Settings, backup and About come here." />
    </Screen>
  )
}
