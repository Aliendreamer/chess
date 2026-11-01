import { EmptyState } from '@/components/primitives'
import { Screen } from '@/components/screen'

/** The Analyse tab's home (mobile-app 5.6 and 5.9 bring the analysis board, review and library here). */
export default function Analyse() {
  return (
    <Screen title="Analyse">
      <EmptyState
        title="Coming next"
        body="The analysis board, reviews and the library come here."
      />
    </Screen>
  )
}
