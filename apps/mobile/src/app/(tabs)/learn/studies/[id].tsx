import { EmptyState } from '@/components/primitives'
import { Screen } from '@/components/screen'

/** A study (mobile-app 5.7 brings the editor here). */
export default function Study() {
  return (
    <Screen title="Study">
      <EmptyState title="Coming next" body="The study editor comes here." />
    </Screen>
  )
}
