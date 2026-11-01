import type { ReactNode } from 'react'
import { StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native'
import { STANDARD_START, groupFamilies, uciSquares } from '@chess/core'
import { lineState, lineText, movesText, sanAt, studyLineLabel } from '@chess/view'
import type { FamilyProgress, RunResult, StudyLineState, TrainerLine } from '@chess/core'
import type { Drill, TrainerColor } from '@chess/view'
import { useTheme } from '@/theme/theme'
import { FONTS, RADIUS, TEXT, type Colors } from '@/theme/tokens'
import { Board } from './board'
import { Button, Chip, Row } from './primitives'

/**
 * The opening trainer on the phone (opening-trainer, study-repertoire-trainer, mobile-app D5): the families, a drill
 * with Learn/Test above the board and the line's box and count beside whose move it is, and the lines' states.
 */

const COLOR_LABEL: Record<TrainerColor, string> = { white: 'White', black: 'Black' }
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const DAY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

export function dueText(at: string): string {
  return DAY.format(new Date(at))
}

/** As White or as Black. */
export function ColorChips({
  color,
  onColor,
}: {
  color: TrainerColor
  onColor: (color: TrainerColor) => void
}) {
  return (
    <View style={styles.wrap} accessibilityLabel="Train as">
      {(['white', 'black'] as const).map((c) => (
        <Chip
          key={c}
          label={`As ${COLOR_LABEL[c]}`}
          selected={c === color}
          onPress={() => onColor(c)}
        />
      ))}
    </View>
  )
}

/** "23 of 41 learned" with a bar. */
export function LearnedBar({ learned, lines }: { learned: number; lines: number }) {
  const { colors } = useTheme()
  const label = `${learned} of ${lines} learned`
  const share = lines === 0 ? 0 : Math.round((learned / lines) * 100)
  return (
    <View style={styles.learned}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        style={[styles.track, { backgroundColor: colors.surfaceInset }]}
      >
        <View style={{ width: `${share}%`, backgroundColor: colors.statusWin }} />
      </View>
      <Text style={[styles.mono, { color: colors.fgSecondary }]}>{label}</Text>
    </View>
  )
}

/** "36 lines" until something is learned, then "3/36 learned". */
export function learnedCount(learned: number, lines: number): string {
  return learned > 0 ? `${learned}/${lines} learned` : plural(lines, 'line', 'lines')
}

/** The families by kind (gambits, defences, openings, games); a kind the search left empty is not shown. */
export function FamilyColumns({
  families,
  onOpen,
}: {
  families: ReadonlyArray<FamilyProgress>
  onOpen: (name: string) => void
}) {
  const { colors } = useTheme()
  if (families.length === 0)
    return <Text style={[styles.small, { color: colors.fgSecondary }]}>No opening matches.</Text>
  return (
    <View testID="trainer-families" style={styles.groups}>
      {groupFamilies(families)
        .filter((g) => g.families.length > 0)
        .map((g) => (
          <View key={g.kind}>
            <View style={styles.groupHead}>
              <Text accessibilityRole="header" style={[styles.group, { color: colors.fgPrimary }]}>
                {g.label}
              </Text>
              <Text style={[styles.xs, { color: colors.fgMuted }]}>{g.families.length}</Text>
            </View>
            <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
              {g.families.map((f) => (
                <Row
                  key={f.name}
                  label={f.name}
                  value={learnedCount(f.learned, f.lines)}
                  onPress={() => onOpen(f.name)}
                />
              ))}
            </View>
          </View>
        ))}
    </View>
  )
}

function stateColor(colors: Colors, state: ReturnType<typeof lineState>): string {
  if (state === 'learned') return colors.statusWin
  if (state === 'learning') return colors.fgAccent
  return colors.fgMuted
}

/** A family's lines with their state. */
export function LinesList({ lines }: { lines: ReadonlyArray<TrainerLine> }) {
  const { colors } = useTheme()
  return (
    <View accessibilityLabel="Lines">
      {lines.map((l) => {
        const state = lineState(l)
        return (
          <View key={l.key} style={[styles.line, { borderTopColor: colors.lineDivider }]}>
            <Text style={[styles.small, styles.grow, { color: colors.fgPrimary }]}>{l.name}</Text>
            <Text style={[styles.mono, { color: colors.fgSecondary }]}>{l.eco}</Text>
            <Text style={[styles.small, styles.state, { color: stateColor(colors, state) }]}>
              {state}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

/** A study's lines, named from where they leave the main line, with their state. */
export function StudyLinesList({
  lines,
  startFen,
}: {
  lines: ReadonlyArray<StudyLineState>
  startFen: string
}) {
  const { colors } = useTheme()
  const main = lines[0]?.moves ?? []
  return (
    <View accessibilityLabel="Lines">
      {lines.map((l) => {
        const state = lineState(l)
        return (
          <View key={l.key} style={[styles.line, { borderTopColor: colors.lineDivider }]}>
            <Text style={[styles.mono, styles.grow, { color: colors.fgPrimary }]}>
              {studyLineLabel(main, l.moves, startFen)}
            </Text>
            <Text style={[styles.small, styles.state, { color: stateColor(colors, state) }]}>
              {state}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

/** What a finished run did to the line. */
export function RunOutcome({ result, mistakes }: { result: RunResult; mistakes: number }) {
  const { colors } = useTheme()
  const text =
    mistakes > 0
      ? `${plural(mistakes, 'mistake', 'mistakes')}. This line comes back first.`
      : `Clean. ${result.learned ? 'Learned — due' : 'Due'} again ${dueText(result.dueAt)}.`
  return (
    <Text testID="run-outcome" style={[styles.small, { color: colors.fgPrimary }]}>
      {text}
    </Text>
  )
}

/**
 * A drill on the board (mobile-app D5): Learn or Test above the board — Learn shows the whole line, Test hides it —
 * whose move it is with the line's box and the count beside it, then the line so far, what the drill wants, Hint, and
 * the run's outcome as `children`.
 */
export function DrillView({
  drill,
  color,
  title,
  moves,
  box,
  count,
  startFen = STANDARD_START,
  children,
}: {
  drill: Drill
  color: TrainerColor
  title: string
  moves: ReadonlyArray<string>
  /** The line's Leitner box, null before its first run. */
  box: number | null
  /** "3 of 12 learned". */
  count: string
  startFen?: string
  children?: ReactNode
}) {
  const { colors } = useTheme()
  const { width } = useWindowDimensions()
  const hint = uciSquares(drill.hint)
  const toPlay = drill.fen.split(' ')[1] === 'b' ? 'Black' : 'White'
  const san = (uci?: string) => sanAt(moves, drill.ply, uci, startFen)
  const status = drill.wrong
    ? `${san(drill.wrong.played)} is not the line. Play ${san()}.`
    : drill.otherLine
      ? `${san(drill.otherLine.played)} is your other line here. This one goes ${san()}.`
      : drill.hint
        ? `Hint: ${san()}.`
        : drill.yourMove
          ? 'Your move.'
          : 'The board plays…'
  return (
    <View style={styles.drill}>
      <View style={styles.modeRow}>
        <Text style={[styles.small, { color: drill.lineShown ? colors.fgAccent : colors.fgMuted }]}>
          Learn
        </Text>
        <Switch
          accessibilityLabel="Test"
          value={!drill.lineShown}
          onValueChange={(test) => (test ? drill.hideLine() : drill.showLine())}
          trackColor={{ true: colors.accentFill, false: colors.lineStrong }}
        />
        <Text style={[styles.small, { color: drill.lineShown ? colors.fgMuted : colors.fgAccent }]}>
          Test
        </Text>
      </View>
      <Text style={[styles.xs, { color: colors.fgSecondary }]}>
        {`${toPlay} to play · ${box === null ? 'new line' : `box ${box}`} · ${count}`}
      </Text>
      <View style={styles.bleed}>
        <Board
          fen={drill.fen}
          orientation={color}
          size={width}
          side={color}
          lastMove={uciSquares(moves[drill.ply - 1])}
          arrows={hint ? [hint] : []}
          {...(drill.yourMove ? { onMove: drill.play } : {})}
        />
      </View>
      <View testID="drill" style={styles.panel}>
        <Text style={[styles.title, { color: colors.fgPrimary }]}>{title}</Text>
        <Text style={[styles.mono, { color: colors.fgBody }]}>
          {lineText(moves, drill.ply, startFen)}
        </Text>
        {drill.lineShown && !drill.done ? (
          <Text testID="drill-coming" style={[styles.mono, { color: colors.fgSecondary }]}>
            {`Still to come: ${movesText(moves, drill.ply, moves.length, startFen)}`}
          </Text>
        ) : null}
        {drill.done ? null : (
          <Text
            testID="drill-status"
            accessibilityLiveRegion="polite"
            style={[styles.small, { color: drill.wrong ? colors.statusLoss : colors.fgSecondary }]}
          >
            {status}
          </Text>
        )}
        {drill.done ? null : (
          <View style={styles.wrap}>
            <Button
              label="Hint"
              disabled={!drill.yourMove || drill.hint !== null}
              onPress={drill.askHint}
            />
          </View>
        )}
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  learned: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { width: 96, height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row' },
  groups: { gap: 16 },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  group: { fontFamily: FONTS.display, fontSize: TEXT['display-xs'].size },
  card: { borderRadius: RADIUS.card, overflow: 'hidden' },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  grow: { flex: 1 },
  state: { width: 64, textAlign: 'right' },
  drill: { gap: 10 },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bleed: { marginHorizontal: -16 },
  panel: { gap: 8 },
  title: { fontFamily: FONTS.display, fontSize: TEXT['display-xs'].size },
  small: { fontFamily: FONTS.sans, fontSize: TEXT.sm.size, lineHeight: TEXT.sm.lineHeight },
  xs: { fontFamily: FONTS.sans, fontSize: TEXT.xs.size, lineHeight: TEXT.xs.lineHeight },
  mono: { fontFamily: FONTS.mono, fontSize: TEXT.sm.size, lineHeight: TEXT.sm.lineHeight },
})
