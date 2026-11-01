import { Platform, Pressable, Share, Text, View } from 'react-native'
import Constants from 'expo-constants'
import type { CrashNotice as Notice } from '@chess/local'

/** What Stockfish was doing, in the player's words. */
const DOING: Record<string, string> = {
  game: 'while thinking about its move in your game',
  board: 'while analysing the board',
  judgement: 'while judging an offer in your game',
  review: 'while reviewing a game',
  miner: 'while looking for training positions',
}

/** The report a player may share (never sent by itself): what helps find the fault, nothing personal. */
export function crashReport(
  notice: Notice,
  device: { app: string; os: string; model: string } = deviceFacts(),
): string {
  return [
    'Chess for phones: Stockfish crash report',
    `App ${device.app}, Stockfish 19`,
    `Phone ${device.model}, ${device.os}`,
    `Signal ${notice.signal} at ${notice.at}`,
    `Doing ${notice.kind ?? 'nothing'}${notice.fen ? ` on ${notice.fen}` : ''}`,
  ].join('\n')
}

function deviceFacts() {
  const constants = Platform.constants as {
    Model?: string
    Brand?: string
    interfaceIdiom?: string
  }
  return {
    app: Constants.expoConfig?.version ?? 'unknown',
    os: `${Platform.OS} ${Platform.Version}`,
    model:
      [constants.Brand, constants.Model ?? constants.interfaceIdiom].filter(Boolean).join(' ') ||
      'unknown',
  }
}

/**
 * The start-up notice after Stockfish crashed the app (mobile-app D13): what it was doing, that everything was saved,
 * and a report to share. For a game the player chooses whether the engine is asked again.
 */
export function CrashNotice({
  notice,
  onDismiss,
  game,
}: {
  notice: Notice
  onDismiss: () => void
  game?: { tryAgain: () => void; takeBack: () => void }
}) {
  const doing = notice.kind ? DOING[notice.kind] : null
  return (
    <View accessibilityRole="alert" style={{ gap: 12, padding: 16 }}>
      <Text>{`Stockfish crashed and the app had to close${doing ? `, ${doing}` : ''}. Everything was saved.`}</Text>
      {game ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable onPress={game.tryAgain}>
            <Text>Try again</Text>
          </Pressable>
          <Pressable onPress={game.takeBack}>
            <Text>Take back my last move</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable onPress={() => void Share.share({ message: crashReport(notice) })}>
          <Text>Share a report</Text>
        </Pressable>
        <Pressable onPress={onDismiss}>
          <Text>Close</Text>
        </Pressable>
      </View>
    </View>
  )
}
