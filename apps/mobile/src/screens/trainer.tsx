import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import {
  familyLines,
  nextFamilyLine,
  nextStudyLine,
  recordRun,
  studyDrill,
  trainerFamilies,
  trainerStudies,
} from '@chess/local'
import { isColor, lineState, useCommand, useDrill } from '@chess/view'
import type {
  FamilyProgress,
  RunResult,
  StudyLineState,
  StudyTraining,
  TrainerLine,
} from '@chess/core'
import type { TrainerColor } from '@chess/view'
import type { ReactNode } from 'react'
import { MobileLink } from '@/components/mobile-link'
import { ErrorLine } from '@/components/play'
import { Button, Chip, EmptyState, Row, Section } from '@/components/primitives'
import { Screen } from '@/components/screen'
import {
  ColorChips,
  DrillView,
  FamilyColumns,
  LearnedBar,
  LinesList,
  RunOutcome,
  StudyLinesList,
  dueText,
  learnedCount,
} from '@/components/trainer'
import { appHref } from '@/lib/links'
import { useServices } from '@/lib/services-context'
import { useTheme } from '@/theme/theme'
import { FONTS, RADIUS, TEXT } from '@/theme/tokens'

const text = (value: string | Array<string> | undefined) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

function useColor(): TrainerColor {
  const { color } = useLocalSearchParams<{ color?: string }>()
  return isColor(color) ? color : 'white'
}

/** Reads `load` on mount and whenever its inputs change; `reload` reads again (after a run). */
function useLoaded<T>(load: () => Promise<T>): { value: T | undefined; reload: () => void } {
  const [value, setValue] = useState<T | undefined>(undefined)
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    let live = true
    void load().then((v) => live && setValue(v))
    return () => {
      live = false
    }
  }, [load, generation])
  return { value, reload: () => setGeneration((g) => g + 1) }
}

/**
 * The opening trainer (opening-trainer): the families of the named lines, searched, each with the player's progress;
 * or, with `?source=studies`, their own studies (study-repertoire-trainer).
 */
export function TrainerScreen() {
  const { db } = useServices()
  const { colors } = useTheme()
  const router = useRouter()
  const params = useLocalSearchParams<{ q?: string; source?: string }>()
  const color = useColor()
  const q = text(params.q)
  const studies = params.source === 'studies'
  const [typed, setTyped] = useState(q ?? '')
  const load = useCallback(
    (): Promise<{
      families: Array<FamilyProgress> | null
      studies: Array<StudyTraining> | null
    }> =>
      studies
        ? trainerStudies(db, color).then((s) => ({ studies: s, families: null }))
        : trainerFamilies(db, color, q).then((f) => ({ families: f, studies: null })),
    [db, color, q, studies],
  )
  const { value } = useLoaded(load)
  const open = (path: string) => router.push(appHref(path, { color }) as Href)

  return (
    <Screen title="Opening trainer">
      <Text style={[styles.small, { color: colors.fgSecondary }]}>
        Pick an opening, or one of your studies: the board plays the other side of its lines, you
        play yours. A line you know comes back less often; a line you miss comes back first.
      </Text>
      <View style={styles.wrap} accessibilityLabel="Train">
        <Chip
          label="Named openings"
          selected={!studies}
          onPress={() => router.setParams({ source: undefined })}
        />
        <Chip
          label="My studies"
          selected={studies}
          onPress={() => router.setParams({ source: 'studies' })}
        />
      </View>
      <ColorChips color={color} onColor={(c) => router.setParams({ color: c })} />
      {studies ? null : (
        <TextInput
          accessibilityLabel="Opening"
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={() => router.setParams({ q: typed.trim() || undefined })}
          returnKeyType="search"
          placeholder="Opening or variation (najdorf, berlin…)"
          placeholderTextColor={colors.fgMuted}
          autoCorrect={false}
          style={[
            styles.input,
            {
              color: colors.fgPrimary,
              backgroundColor: colors.surfaceInset,
              borderColor: colors.lineDefault,
            },
          ]}
        />
      )}
      {value?.families ? (
        <FamilyColumns
          families={value.families}
          onOpen={(name) => open(`/learn/trainer/${encodeURIComponent(name)}`)}
        />
      ) : null}
      {value?.studies ? (
        value.studies.length === 0 ? (
          <EmptyState
            title="No studies yet"
            body="Every line of a study you make can be drilled here."
            action={{ label: 'Make a study', onPress: () => router.push('/learn/studies') }}
          />
        ) : (
          <Section title="My studies">
            {value.studies.map((s) => (
              <Row
                key={s.id}
                label={s.title}
                value={learnedCount(s.learned, s.lines)}
                onPress={() => open(`/learn/trainer/study/${encodeURIComponent(s.id)}`)}
              />
            ))}
          </Section>
        )
      ) : null}
    </Screen>
  )
}

/** One family's drill (opening-trainer): the next due line on the board, each run's outcome, every line's state. */
export function FamilyScreen() {
  const { db } = useServices()
  const router = useRouter()
  const { family } = useLocalSearchParams<{ family: string }>()
  const color = useColor()
  const load = useCallback(
    () => Promise.all([familyLines(db, family, color), nextFamilyLine(db, family, color)]),
    [db, family, color],
  )
  const { value, reload } = useLoaded(load)
  if (value === undefined) return <Screen title={family}>{null}</Screen>
  const [lines, first] = value
  if (!lines || !first)
    return (
      <Screen title={family}>
        <EmptyState title="No such opening" body="It is not among the named lines." />
      </Screen>
    )
  const learned = lines.filter((l) => lineState(l) === 'learned').length
  return (
    <Screen title={family}>
      <ColorChips color={color} onColor={(c) => router.setParams({ color: c })} />
      <LearnedBar learned={learned} lines={lines.length} />
      <Drills
        key={color}
        first={first}
        next={() => nextFamilyLine(db, family, color)}
        record={(lineKey, mistakes) => recordRun(db, { lineKey, color, mistakes })}
        onRecorded={reload}
        board={(line, onDone) => (
          <TrainerDrill
            line={line}
            color={color}
            title={`${line.eco} ${line.name}`}
            count={`${learned} of ${lines.length} learned`}
            onDone={onDone}
          />
        )}
        done={(nextDueAt) => (
          <EmptyState
            title={nextDueAt ? 'Done for now' : 'Nothing to train'}
            body={
              nextDueAt
                ? `Every line is known. The next one is due ${dueText(nextDueAt)}.`
                : 'This opening has no line to train.'
            }
            action={{ label: 'Another opening', onPress: () => router.back() }}
          />
        )}
      />
      <Section title="Lines">
        <View style={styles.inset}>
          <LinesList lines={lines} />
        </View>
      </Section>
    </Screen>
  )
}

/** One of the player's studies drilled line by line from its start (study-repertoire-trainer). */
export function StudyTrainerScreen() {
  const { db } = useServices()
  const { colors } = useTheme()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const color = useColor()
  const load = useCallback(
    () => Promise.all([studyDrill(db, id, color), nextStudyLine(db, id, color)]),
    [db, id, color],
  )
  const { value, reload } = useLoaded(load)
  if (value === undefined) return <Screen title="Trainer">{null}</Screen>
  const [study, first] = value
  if (!study || !first)
    return (
      <Screen title="Trainer">
        <EmptyState title="No such study" body="It may have been removed with a restore." />
      </Screen>
    )
  const learned = study.lines.filter((l) => lineState(l) === 'learned').length
  const allMoves = study.lines.map((l) => l.moves)
  return (
    <Screen title={study.title}>
      <ColorChips color={color} onColor={(c) => router.setParams({ color: c })} />
      <LearnedBar learned={learned} lines={study.lines.length} />
      <Text style={[styles.xs, { color: colors.fgMuted }]}>
        Every line of the study, from its start to the end of a variation. A line you change starts
        again.
      </Text>
      <Drills
        key={color}
        first={first}
        next={() => nextStudyLine(db, id, color)}
        record={(lineKey, mistakes) => recordRun(db, { lineKey, color, mistakes, studyId: id })}
        onRecorded={reload}
        board={(line, onDone) => (
          <TrainerDrill
            line={line}
            color={color}
            title="Your line"
            count={`${learned} of ${study.lines.length} learned`}
            startFen={study.startFen}
            // This line's own move is checked first, so its entry here never reads as another line.
            others={allMoves}
            onDone={onDone}
          />
        )}
        done={(nextDueAt) => (
          <EmptyState
            title={nextDueAt ? 'Done for now' : 'Nothing to train'}
            body={
              nextDueAt
                ? `Every line is known. The next one is due ${dueText(nextDueAt)}.`
                : `This study has no line with a move for ${color}.`
            }
          />
        )}
      />
      <Section title="Lines">
        <View style={styles.inset}>
          <StudyLinesList lines={study.lines} startFen={study.startFen} />
        </View>
      </Section>
      <MobileLink to={appHref(`/studies/${encodeURIComponent(id)}`, {})}>Open the study</MobileLink>
    </Screen>
  )
}

type Line = TrainerLine | StudyLineState

/** The line on the board, the run's outcome and Next line; a new run (even of the same line) is a new drill. */
function Drills<L extends Line>({
  first,
  next,
  record,
  onRecorded,
  board,
  done,
}: {
  first: { line: L | null; nextDueAt: string | null }
  next: () => Promise<{ line: L | null; nextDueAt: string | null } | null>
  record: (lineKey: string, mistakes: number) => Promise<RunResult>
  onRecorded: () => void
  board: (line: L, onDone: (mistakes: number) => void) => ReactNode
  done: (nextDueAt: string | null) => ReactNode
}) {
  const [current, setCurrent] = useState(first)
  const [run, setRun] = useState(0)
  const [outcome, setOutcome] = useState<{ result: RunResult; mistakes: number } | null>(null)
  const recording = useCommand()
  const line = current.line

  // Recorded once per run: the drill calls it once when the line ends.
  async function onDone(lineKey: string, mistakes: number) {
    const result = await recording.run(async () => ({
      ok: true as const,
      view: await record(lineKey, mistakes),
    }))
    if (result) setOutcome({ result, mistakes })
    onRecorded()
  }

  async function nextLine() {
    const answer = await next()
    if (answer) setCurrent(answer)
    setOutcome(null)
    setRun((r) => r + 1)
  }

  if (!line) return <>{done(current.nextDueAt)}</>
  return (
    <View key={`${line.key}|${run}`} style={styles.drills}>
      {board(line, (mistakes) => void onDone(line.key, mistakes))}
      {outcome ? (
        <>
          <RunOutcome result={outcome.result} mistakes={outcome.mistakes} />
          <Button label="Next line" kind="primary" onPress={() => void nextLine()} />
        </>
      ) : null}
      {recording.error ? <ErrorLine text={recording.error} /> : null}
    </View>
  )
}

function TrainerDrill({
  line,
  color,
  title,
  count,
  startFen,
  others = [],
  onDone,
}: {
  line: Line
  color: TrainerColor
  title: string
  count: string
  startFen?: string
  others?: ReadonlyArray<ReadonlyArray<string>>
  onDone: (mistakes: number) => void
}) {
  // A line never trained opens in Learn: its first run is for learning it.
  const drill = useDrill(
    { ...line, learn: line.box === null },
    color,
    onDone,
    400,
    startFen,
    others,
  )
  return (
    <DrillView
      drill={drill}
      color={color}
      title={title}
      moves={line.moves}
      box={line.box}
      count={count}
      {...(startFen ? { startFen } : {})}
    />
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inset: { paddingHorizontal: 14 },
  drills: { gap: 10 },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FONTS.sans,
    fontSize: TEXT.base.size,
  },
  small: { fontFamily: FONTS.sans, fontSize: TEXT.sm.size, lineHeight: TEXT.sm.lineHeight },
  xs: { fontFamily: FONTS.sans, fontSize: TEXT.xs.size, lineHeight: TEXT.xs.lineHeight },
})
