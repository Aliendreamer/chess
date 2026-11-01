import { useLocalSearchParams } from 'expo-router'
import { GameScreen } from '@/screens/play'

/** A game in play takes the full screen, over the tabs (mobile-app D5). */
export default function GameRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <GameScreen id={id} />
}
