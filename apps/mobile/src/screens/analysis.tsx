import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import {
  STANDARD_START,
  fenAt,
  fromInput,
  isFen,
  lineEnd,
  nextPath,
  parsePgn,
  playMove,
  positionKey,
  scoreText,
  toInput,
  uciSquares,
} from '@chess/core'
import {
  DRAFTS,
  analysisStart,
  createStudies,
  draftWriter,
  libraryPosition,
  openingNames,
} from '@chess/local'
import {
  analysisTitle,
  useAnalysis,
  useAutoEvaluate,
  useCommand,
  useLibraryPosition,
  useMoveTree,
  useOpeningName,
} from '@chess/view'
import type { ParsedGame } from '@chess/core'
import type { AnalysisStart } from '@chess/local'
import {
  EngineLines,
  EvalBar,
  EvaluationSwitches,
  LibraryPanel,
  MoveNav,
  MoveTree,
  NavButton,
  ThinkChips,
  type EvaluationShown,
} from '@/components/analysis'
import { Board } from '@/components/board'
import { ErrorLine } from '@/components/play'
import { Button, Section, Sheet, TOUCH } from '@/components/primitives'
import { Screen } from '@/components/screen'
import { appHref, mobileRoute } from '@/lib/links'
import { usePreferences } from '@/lib/preferences'
import { useServices } from '@/lib/services-context'
import { useTheme } from '@/theme/theme'
import { FONTS, RADIUS, TEXT } from '@/theme/tokens'

const param = (value: string | Array<string> | undefined) =>
  typeof value === 'string' && value !== '' ? value : undefined

/**
 * The analysis board (analysis-board): any position or game with the move tree and the engine, nothing kept until it
 * is saved as a study. Starts from `?fen=`, `?game={id}` (a finished game) or `?library={id}&ply=`, or what is pasted;
 * with none of them, where the player left it (the draft, mobile-app D13).
 */
export function AnalysisScreen() {
  const { db } = useServices()
  const params = useLocalSearchParams<{
    fen?: string
    game?: string
    library?: string
    ply?: string
  }>()
  const fen = param(params.fen)
  const game = param(params.game)
  const library = param(params.library)
  const plyText = param(params.ply)
  const ply = plyText !== undefined && /^\d+$/.test(plyText) ? Number(plyText) : undefined
  const [start, setStart] = useState<{ key: string; start: AnalysisStart } | null>(null)
  const key = [fen, game, library, ply].join('|')
  useEffect(() => {
    let live = true
    void analysisStart(db, { fen, game, library, ply }).then(
      (s) => live && setStart({ key, start: s }),
    )
    return () => {
      live = false
    }
  }, [db, fen, game, library, ply, key])
  if (!start || start.key !== key) return <Screen title="Analysis">{null}</Screen>
  // A new starting point starts a new board.
  return <AnalysisBoard key={key} start={start.start} />
}

function AnalysisBoard({ start }: { start: AnalysisStart }) {
  const services = useServices()
  const { db } = services
  const { colors } = useTheme()
  const { preferences, update } = usePreferences()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const editor = useMoveTree(start.startFen, start.tree, start.path)
  const [shown, setShown] = useState<EvaluationShown>({
    bar: preferences.analysisBar,
    line: preferences.analysisLines,
  })
  function show(next: EvaluationShown) {
    setShown(next)
    void update({ analysisBar: next.bar, analysisLines: next.line })
  }
  const [request] = useState(
    () => (input: Parameters<typeof services.evaluator.request>[0]) =>
      services.evaluator.request(input),
  )
  const analysis = useAnalysis(request)
  useAutoEvaluate(analysis, editor.fen, shown.bar || shown.line)
  const evaluation = analysis.evaluationOf(editor.fen)

  // The line's positions (start excluded) name the opening.
  const keys = editor.path.map((_, i) =>
    positionKey(fenAt(editor.startFen, editor.tree, editor.path.slice(0, i + 1))),
  )
  const [loadOpening] = useState(
    () => (k: string) => openingNames(db, [k]).then((names) => names.get(k) ?? null),
  )
  const opening = useOpeningName(keys, loadOpening)
  const [loadPosition] = useState(() => (f: string) => libraryPosition(db, f))
  const atPosition = useLibraryPosition(editor.fen, 'all', loadPosition)
  const [libraryOpen, setLibraryOpen] = useState(false)

  const [players, setPlayers] = useState(start.players)
  const [pasted, setPasted] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(start.error)
  const [choices, setChoices] = useState<Array<ParsedGame & { ok: true }>>([])
  const saving = useCommand()

  // The board as it changes, so the app closing loses nothing (mobile-app D13); saved as a study, it is dropped.
  const [draft] = useState(() => draftWriter(db, DRAFTS.analysis))
  useEffect(() => {
    draft.write({
      startFen: editor.startFen,
      tree: editor.tree,
      path: editor.path,
      ...(players ? { players } : {}),
    })
  }, [draft, editor.startFen, editor.tree, editor.path, players])
  useEffect(() => () => void draft.flush().catch(() => undefined), [draft])

  function playUci(uci: string) {
    const move = playMove(editor.fen, uci)
    if (move) editor.playLine([move])
  }

  async function save() {
    const result = await saving.run(async () => ({
      ok: true as const,
      view: await createStudies(db, [
        {
          title: analysisTitle(players),
          startFen: editor.startFen,
          tree: toInput(editor.tree),
          white: players?.white ?? null,
          black: players?.black ?? null,
        },
      ]),
    }))
    const created = result?.created[0]
    if (created) {
      await draft.clear()
      router.push(mobileRoute(`/studies/${encodeURIComponent(created.id)}`) as Href)
    }
  }

  /** A FEN replaces the position; a PGN its moves (one game at once, several offered to pick from). */
  function load(text: string) {
    const trimmed = text.trim()
    setChoices([])
    if (isFen(trimmed)) {
      editor.reset(trimmed, [])
      setPlayers(undefined)
      setPasteError(null)
      return
    }
    const games = parsePgn(trimmed).filter((g): g is ParsedGame & { ok: true } => g.ok)
    if (games.length === 0) {
      setPasteError('That is neither a legal FEN nor a PGN game.')
      return
    }
    setPasteError(null)
    if (games.length === 1) open(games[0]!)
    else setChoices(games)
  }

  function open(game: ParsedGame & { ok: true }) {
    const startFen = game.study.startFen ?? STANDARD_START
    const tree = fromInput(startFen, game.study.tree)
    editor.reset(startFen, tree, lineEnd(tree, []))
    setPlayers(
      game.study.white && game.study.black
        ? { white: game.study.white, black: game.study.black }
        : undefined,
    )
    setChoices([])
  }

  const scoreOf = (at: string) => {
    const best = analysis.evaluationOf(at)?.lines[0]
    return best ? scoreText(best) : null
  }
  const { tree, path } = editor

  return (
    <Screen title="Analysis">
      <View style={styles.head}>
        <Text style={[styles.small, { color: colors.fgSecondary }]}>
          {players
            ? `${players.white} vs ${players.black}`
            : 'Not kept until you save it as a study.'}
        </Text>
        {opening ? (
          <Text style={[styles.small, { color: colors.fgAccent }]}>
            {`${opening.eco} ${opening.name}`}
          </Text>
        ) : null}
        {atPosition && atPosition.games > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setLibraryOpen(true)}
            style={styles.libraryLine}
          >
            <Text style={[styles.small, { color: colors.fgAccent }]}>
              {`In the library · ${atPosition.games} ${atPosition.games === 1 ? 'game' : 'games'} ›`}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {pasteError ? <ErrorLine text={pasteError} /> : null}
      {shown.bar ? <EvalBar evaluation={evaluation} orientation={editor.orientation} /> : null}
      {/* Edge to edge: the board keeps the full width (mobile-app D5). */}
      <View style={styles.bleed}>
        <Board
          fen={editor.fen}
          orientation={editor.orientation}
          size={width}
          lastMove={uciSquares(editor.current?.uci)}
          onMove={playUci}
        />
      </View>
      <MoveNav
        onFirst={() => editor.setPath([])}
        onPrevious={() => editor.setPath(path.slice(0, -1))}
        onNext={() => editor.setPath(nextPath(tree, path) ?? path)}
        onLast={() => editor.setPath(lineEnd(tree, path))}
      >
        <NavButton label="Flip board" glyph="⇅" onPress={editor.flip} />
      </MoveNav>
      {shown.line ? (
        <View style={styles.engine}>
          <EngineLines
            fen={editor.fen}
            evaluation={evaluation}
            error={analysis.error}
            onPlay={editor.playLine}
          />
          <ThinkChips analysis={analysis} />
        </View>
      ) : null}
      <MoveTree
        tree={tree}
        startFen={editor.startFen}
        current={path}
        onSelect={editor.setPath}
        scoreOf={scoreOf}
      />
      <EvaluationSwitches shown={shown} onChange={show} />
      <Button
        label="Save as study"
        kind="primary"
        disabled={saving.busy}
        onPress={() => void save()}
      />
      {saving.error ? <ErrorLine text={saving.error} /> : null}
      <Section title="Start from">
        <View style={styles.start}>
          <TextInput
            accessibilityLabel="FEN or PGN"
            value={pasted}
            onChangeText={setPasted}
            multiline
            placeholder="Paste a FEN or a PGN"
            placeholderTextColor={colors.fgMuted}
            autoCapitalize="none"
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
          <View style={styles.row}>
            <Button label="Load" disabled={pasted.trim() === ''} onPress={() => load(pasted)} />
            <Button
              label="Start position"
              onPress={() => {
                editor.reset(STANDARD_START, [])
                setPlayers(undefined)
                setPasteError(null)
              }}
            />
          </View>
          {choices.map((g, i) => (
            <Button key={i} label={g.study.title} onPress={() => open(g)} />
          ))}
        </View>
      </Section>
      <Sheet visible={libraryOpen} title="In the library" onClose={() => setLibraryOpen(false)}>
        {atPosition ? (
          <LibraryPanel
            position={atPosition}
            fen={editor.fen}
            onPlay={(uci) => {
              setLibraryOpen(false)
              playUci(uci)
            }}
            onOpenGame={(id, ply) => {
              setLibraryOpen(false)
              router.push(appHref('/analyse', { library: id, ply: String(ply) }) as Href)
            }}
          />
        ) : null}
      </Sheet>
    </Screen>
  )
}

const styles = StyleSheet.create({
  head: { gap: 2 },
  libraryLine: { minHeight: TOUCH - 12, justifyContent: 'center' },
  bleed: { marginHorizontal: -16 },
  engine: { gap: 8 },
  start: { padding: 12, gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: RADIUS.control,
    padding: 10,
    fontFamily: FONTS.mono,
    fontSize: TEXT.sm.size,
    textAlignVertical: 'top',
  },
  small: { fontFamily: FONTS.sans, fontSize: TEXT.sm.size, lineHeight: TEXT.sm.lineHeight },
})
