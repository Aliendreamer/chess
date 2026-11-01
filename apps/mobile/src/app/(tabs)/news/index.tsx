import { EmptyState } from '@/components/primitives'
import { Screen } from '@/components/screen'

/** The News tab (mobile-app 5.10 brings the news and tournaments here). */
export default function News() {
  return (
    <Screen title="News">
      <EmptyState title="Coming next" body="The news and tournaments come here." />
    </Screen>
  )
}
