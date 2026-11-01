import { EmptyState } from '@/components/primitives'
import { Screen } from '@/components/screen'

/** A study's lines in the trainer (mobile-app 5.8 brings them here). */
export default function StudyTrainer() {
  return (
    <Screen title="Trainer">
      <EmptyState title="Coming next" body="The trainer comes here." />
    </Screen>
  )
}
