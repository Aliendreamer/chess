import { EmptyState } from '@/components/primitives'
import { Screen } from '@/components/screen'

/** The Learn tab's home (mobile-app 5.8 brings the trainer, training and studies here). */
export default function Learn() {
  return (
    <Screen title="Learn">
      <EmptyState title="Coming next" body="The trainer, training and studies come here." />
    </Screen>
  )
}
