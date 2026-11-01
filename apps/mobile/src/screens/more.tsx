import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { ANIMATIONS, BOARD_THEMES, SITE_THEMES } from '@chess/core'
import { FEEDS, enabledSources, getSetting, setSetting, setSourceEnabled } from '@chess/local'
import { useCommand } from '@chess/view'
import type { Animation, BoardTheme, Preferences } from '@chess/core'
import { Board } from '@/components/board'
import { ExternalLink } from '@/components/external-link'
import { ErrorLine } from '@/components/play'
import { Button, Chip, Row, Section, Sheet, TOUCH } from '@/components/primitives'
import { Screen } from '@/components/screen'
import { usePreferences } from '@/lib/preferences'
import { useServices } from '@/lib/services-context'
import { useTheme } from '@/theme/theme'
import { BOARDS, FONTS, RADIUS, TEXT } from '@/theme/tokens'
import pkg from '../../package.json'

/** The More tab (mobile-app D5): settings, backup and restore, About. */
export function MoreHome() {
  const router = useRouter()
  return (
    <Screen title="More">
      <Section title="This app">
        <Row
          label="Settings"
          detail="Board, theme, training, news"
          onPress={() => router.push('/more/settings')}
        />
        <Row
          label="Backup and restore"
          detail="All your data in one file, to keep or to move"
          onPress={() => router.push('/more/backup')}
        />
        <Row
          label="About"
          detail={`Version ${pkg.version} · licences`}
          onPress={() => router.push('/more/about')}
        />
      </Section>
    </Screen>
  )
}

const THEME_NAMES: Record<BoardTheme, string> = {
  brown: 'Brown',
  blue: 'Blue',
  green: 'Green',
  slate: 'Slate',
  walnut: 'Club walnut',
}
const ANIMATION_NAMES: Record<Animation, string> = { off: 'Off', fast: 'Fast', normal: 'Normal' }
const SITE_NAMES: Record<(typeof SITE_THEMES)[number], string> = {
  dark: 'Dark (Club)',
  light: 'Light (Parchment)',
}

/** A position with a capture, a check and both colours, so every highlight and theme shows in the preview. */
const PREVIEW_FEN = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4'

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.wrap} accessibilityLabel={label}>
      {children}
    </View>
  )
}

function SwitchRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  const { colors } = useTheme()
  return (
    <View style={styles.switchRow}>
      <Text style={[styles.body, { color: colors.fgBody }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accentFill, false: colors.lineStrong }}
      />
    </View>
  )
}

/** The settings (user-preferences): each applies at once, with a preview board in the chosen theme. */
export function SettingsScreen() {
  const { db } = useServices()
  const { colors } = useTheme()
  const { width } = useWindowDimensions()
  const { preferences, update } = usePreferences()
  const saving = useCommand()
  const [miner, setMiner] = useState<boolean | null>(null)
  const [sources, setSources] = useState<Array<string> | null>(null)

  useFocusEffect(
    useCallback(() => {
      let live = true
      // The miner is off on the phone until it is turned on (mobile-app D8).
      void Promise.all([getSetting(db, 'training.miner', false), enabledSources(db)]).then(
        ([m, s]) => {
          if (!live) return
          setMiner(m)
          setSources(s)
        },
      )
      return () => {
        live = false
      }
    }, [db]),
  )

  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    void saving.run(async () => {
      await update({ [key]: value } as Partial<Preferences>)
      return { ok: true as const, view: null }
    })

  return (
    <Screen title="Settings">
      <Section title="Board">
        <View style={styles.inset}>
          <Group label="Board theme">
            {BOARD_THEMES.map((theme) => (
              <Chip
                key={theme}
                label={THEME_NAMES[theme]}
                selected={preferences.boardTheme === theme}
                onPress={() => set('boardTheme', theme)}
              >
                <View style={styles.swatch}>
                  {[0, 1, 1, 0].map((dark, i) => (
                    <View
                      key={i}
                      style={[
                        styles.swatchSquare,
                        { backgroundColor: dark ? BOARDS[theme].dark : BOARDS[theme].light },
                      ]}
                    />
                  ))}
                </View>
              </Chip>
            ))}
          </Group>
          <SwitchRow
            label="Coordinates"
            value={preferences.coordinates}
            onChange={(on) => set('coordinates', on)}
          />
        </View>
      </Section>
      <Section title="Piece animation">
        <View style={styles.inset}>
          <Group label="Piece animation">
            {ANIMATIONS.map((a) => (
              <Chip
                key={a}
                label={ANIMATION_NAMES[a]}
                selected={preferences.animation === a}
                onPress={() => set('animation', a)}
              />
            ))}
          </Group>
        </View>
      </Section>
      <Section title="Theme">
        <View style={styles.inset}>
          <Group label="Site theme">
            {SITE_THEMES.map((t) => (
              <Chip
                key={t}
                label={SITE_NAMES[t]}
                selected={preferences.siteTheme === t}
                onPress={() => set('siteTheme', t)}
              />
            ))}
          </Group>
        </View>
      </Section>
      {saving.error ? <ErrorLine text={saving.error} /> : null}
      <View
        testID="settings-preview"
        style={[styles.preview, { backgroundColor: colors.surfaceCard }]}
      >
        <Board
          fen={PREVIEW_FEN}
          orientation="white"
          size={Math.min(width - 56, 360)}
          lastMove={{ from: 'h5', to: 'f7' }}
        />
      </View>
      <Section title="Training">
        <View style={styles.inset}>
          <Text style={[styles.small, { color: colors.fgSecondary }]}>
            The app can look for critical moments in your library’s games while it is open and the
            engine is free. It keeps a processor core busy, so it is off until you turn it on.
          </Text>
          {miner === null ? null : (
            <SwitchRow
              label="Find critical moments"
              value={miner}
              onChange={(on) => {
                setMiner(on)
                void setSetting(db, 'training.miner', on)
              }}
            />
          )}
        </View>
      </Section>
      <Section title="News">
        <View style={styles.inset}>
          {sources === null ? null : (
            <Group label="News sources">
              {[...FEEDS, { id: 'events', name: 'Tournaments' }].map((s) => {
                const on = sources.includes(s.id)
                return (
                  <Chip
                    key={s.id}
                    label={s.name}
                    selected={on}
                    onPress={() => {
                      setSources(on ? sources.filter((x) => x !== s.id) : [...sources, s.id])
                      void setSourceEnabled(db, s.id, !on)
                    }}
                  />
                )
              })}
            </Group>
          )}
        </View>
      </Section>
    </Screen>
  )
}

/**
 * Backup and restore (desktop-app D10, mobile-app D9): everything in one `.chessbackup` file handed to the share sheet,
 * and a picked one restored after a confirmation; a desktop backup restores here and the reverse.
 */
export function BackupScreen() {
  const services = useServices()
  const { colors } = useTheme()
  const working = useCommand()
  const [message, setMessage] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function backup() {
    setMessage(null)
    const done = await working.run(async () => {
      await services.files.backup()
      return { ok: true as const, view: true }
    })
    if (done) setMessage('Backed up: the file went to where you shared it.')
  }

  async function restore() {
    setConfirming(false)
    setMessage(null)
    const done = await working.run(async () => {
      const outcome = await services.files.restore()
      return outcome ?? { ok: true as const, view: false }
    })
    if (done) setMessage('Restored. Your previous data was kept beside the database.')
  }

  return (
    <Screen title="Backup and restore">
      <Text style={[styles.small, { color: colors.fgSecondary }]}>
        Everything — games, studies, progress, library, news and settings — in one file, to keep or
        to move to another phone or a computer with the desktop app.
      </Text>
      <View style={styles.wrap}>
        <Button
          label="Back up"
          kind="primary"
          disabled={working.busy}
          onPress={() => void backup()}
        />
        <Button label="Restore" disabled={working.busy} onPress={() => setConfirming(true)} />
      </View>
      {message ? (
        <Text accessibilityRole="alert" style={[styles.small, { color: colors.fgSecondary }]}>
          {message}
        </Text>
      ) : null}
      {working.error ? <ErrorLine text={working.error} /> : null}
      <Sheet visible={confirming} title="Restore a backup?" onClose={() => setConfirming(false)}>
        <Text style={[styles.small, { color: colors.fgPrimary }]}>
          This replaces all your data with the backup’s. Your current data is kept aside first. Pick
          the file next.
        </Text>
        <Button label="Replace my data" kind="primary" onPress={() => void restore()} />
        <Button label="Cancel" onPress={() => setConfirming(false)} />
      </Sheet>
    </Screen>
  )
}

const REPOSITORY = 'https://github.com/Aliendreamer/chess'
const GPL = 'https://www.gnu.org/licenses/gpl-3.0.html'

/** The version, the app's licence and its source, and every licence it ships with (mobile-app D10). */
export function AboutScreen() {
  const { colors } = useTheme()
  const source = `${REPOSITORY}/tree/mobile@${pkg.version}`
  const p = [styles.small, { color: colors.fgBody }]
  return (
    <Screen title="About">
      <Text style={[styles.small, { color: colors.fgSecondary }]}>{`Version ${pkg.version}`}</Text>
      <View testID="about-app" style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
        <Text style={[styles.body, { color: colors.fgPrimary }]}>
          Chess — play the computer, learn and analyse, offline.
        </Text>
        <Text style={p}>
          Stockfish is built into this app, so the app as a whole is free software under the{' '}
          <ExternalLink url={GPL}>GNU General Public License v3</ExternalLink> (or later): you may
          use, share and change it under its terms.
        </Text>
        <Text style={p}>
          <ExternalLink url={source} label={`The source of this version (opens github.com)`}>
            The source of this version
          </ExternalLink>
          {` is public, on GitHub.`}
        </Text>
      </View>
      <View testID="about-credits" style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
        <Text style={p}>
          <Text style={styles.strong}>Stockfish 19</Text>, the unmodified official source, compiled
          into the app, under the GNU General Public License v3; its licence (Copying.txt) and
          authors ship with the app’s source:{' '}
          <ExternalLink url="https://github.com/official-stockfish/Stockfish/tree/sf_19">
            github.com/official-stockfish/Stockfish
          </ExternalLink>
          .
        </Text>
        <Text style={p}>
          The pieces are the <Text style={styles.strong}>Cburnett</Text> set by Colin M.L. Burnett
          (Wikimedia Commons), under the 3-clause BSD licence.
        </Text>
        <Text style={p}>
          The opening names come from lichess’s{' '}
          <ExternalLink url="https://github.com/lichess-org/chess-openings">
            chess-openings
          </ExternalLink>{' '}
          list, public domain (CC0).
        </Text>
        <Text style={p}>
          The library comes with the World Championship matches from{' '}
          <ExternalLink url="https://www.pgnmentor.com/files.html">PGN Mentor</ExternalLink> (moves
          only) and strong games from{' '}
          <ExternalLink url="https://database.lichess.org/#broadcasts">
            lichess broadcasts
          </ExternalLink>
          , under{' '}
          <ExternalLink url="https://creativecommons.org/licenses/by-sa/4.0/">
            CC BY-SA 4.0
          </ExternalLink>
          .
        </Text>
        <Text style={p}>
          The tab icons are <ExternalLink url="https://lucide.dev">Lucide</ExternalLink>’s, under
          the ISC licence. The fonts are <Text style={styles.strong}>IBM Plex</Text> Sans and Mono
          and <Text style={styles.strong}>Newsreader</Text>, under the SIL Open Font License 1.1.
        </Text>
        <Text style={p}>
          News headlines link to their publishers: FIDE, ChessBase, Lichess and The Week in Chess;
          the tournaments come from lichess’s broadcast list.
        </Text>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  inset: { padding: 12, gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: {
    minHeight: TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  swatch: {
    width: 16,
    height: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 2,
    overflow: 'hidden',
  },
  swatchSquare: { width: 8, height: 8 },
  preview: { alignItems: 'center', padding: 12, borderRadius: RADIUS.card },
  card: { padding: 14, gap: 10, borderRadius: RADIUS.card },
  strong: { fontFamily: FONTS.sansSemiBold },
  small: { fontFamily: FONTS.sans, fontSize: TEXT.sm.size, lineHeight: TEXT.sm.lineHeight },
  body: { fontFamily: FONTS.sans, fontSize: TEXT.base.size, lineHeight: TEXT.base.lineHeight },
})
