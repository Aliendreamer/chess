import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter, type Href } from 'expo-router'
import {
  STANDARD_START,
  applyOptimistic,
  engineName,
  resolvePremove,
  uciSquares,
} from '@chess/core'
import {
  PERSON_NAME,
  askToResign,
  createGame,
  engineMove,
  engineToMove,
  getSetting,
  lastPersonPly,
  listGames,
  loadGame,
  loadReview,
  offerDraw,
  personMove,
  resign,
  reviewable,
  setSetting,
  startReview,
  takeBack,
  toMove,
  versus,
} from '@chess/local'
import {
  REVIEW_POLL_MS,
  previewLine,
  useAnalysis,
  useAutoEvaluate,
  useCommand,
  useReview,
} from '@chess/view'
import type { Color, ColourChoice, SquarePair, ThinkSeconds } from '@chess/core'
import type { PreviewState } from '@chess/view'
import type { DesktopGame, EngineStatus as EngineState, GameListItem } from '@chess/local'
import {
  EngineLines,
  EvalBar,
  EvaluationSwitches,
  MoveNav,
  NavButton,
  type EvaluationShown,
} from '@/components/analysis'
import { Board } from '@/components/board'
import { CrashNotice } from '@/components/crash-notice'
import { EngineStatus } from '@/components/engine-status'
import { EngineForm, ErrorLine, GameEnd, GameRows, MoveText, PlayerLine } from '@/components/play'
import { Button, EmptyState, Row, Section, Sheet, TOUCH } from '@/components/primitives'
import { ReviewPanel } from '@/components/review'
import { Screen } from '@/components/screen'
import { mobileRoute } from '@/lib/links'
import { usePreferences } from '@/lib/preferences'
import { useServices } from '@/lib/services-context'
import { useTheme } from '@/theme/theme'
import { FONTS, TEXT } from '@/theme/tokens'

/** The last choices, so the next game starts where the last one did (as the desktop's `play.choice`). */
interface PlayChoice {
  level: string
  color: ColourChoice
  think: ThinkSeconds
}
const DEFAULT_CHOICE: PlayChoice = { level: '1600', color: 'white', think: 5 }
const RECENT = 8
const PAGE = 30

const gameHref = (id: string) => mobileRoute(`/games/${id}`) as Href

/** Play's home: a game against the computer, the recent games, and what the last run left. */
export function PlayHome() {
  const services = useServices()
  const router = useRouter()
  const [notice, setNotice] = useState(services.crash)
  const [choice, setChoice] = useState<PlayChoice | null>(null)
  const [recent, setRecent] = useState<Array<GameListItem>>([])
  const starting = useCommand()

  // Read again each time Play shows, so a game just played is in the list.
  useFocusEffect(
    useCallback(() => {
      let live = true
      void Promise.all([
        getSetting(services.db, 'play.choice', DEFAULT_CHOICE),
        listGames(services.db, RECENT),
      ]).then(([saved, games]) => {
        if (!live) return
        setChoice((now) => now ?? saved)
        setRecent(games.items)
      })
      return () => {
        live = false
      }
    }, [services]),
  )

  async function start(c: PlayChoice) {
    const game = await starting.run(async () => {
      await setSetting(services.db, 'play.choice', c)
      return {
        ok: true as const,
        view: await createGame(services.db, {
          level: c.level,
          color: c.color,
          thinkSeconds: c.think,
        }),
      }
    })
    if (game) router.push(gameHref(game.id))
  }

  return (
    <Screen title="Play">
      {notice ? <CrashNotice notice={notice} onDismiss={() => setNotice(null)} /> : null}
      <EngineStatus engine={services.engine} />
      {choice ? (
        <EngineForm
          level={choice.level}
          color={choice.color}
          think={choice.think}
          busy={starting.busy}
          error={starting.error}
          onLevel={(level) => setChoice({ ...choice, level })}
          onColor={(color) => setChoice({ ...choice, color })}
          onThink={(think) => setChoice({ ...choice, think })}
          onStart={() => void start(choice)}
        />
      ) : null}
      <Section title="Your games">
        <View style={styles.inset}>
          <GameRows games={recent} onOpen={(id) => router.push(gameHref(id))} />
        </View>
        {recent.length > 0 ? (
          <Row label="All games" onPress={() => router.push('/play/games')} />
        ) : null}
      </Section>
      {__DEV__ ? (
        <Section title="Development">
          <Row label="Engine check" onPress={() => router.push('/dev/engine')} />
        </Section>
      ) : null}
    </Screen>
  )
}

/** Every game against the computer, newest first, a page at a time. */
export function GameList() {
  const { db } = useServices()
  const router = useRouter()
  const [items, setItems] = useState<Array<GameListItem>>([])
  const [next, setNext] = useState<{ updatedAt: string; id: string } | null>(null)
  const more = useCommand()

  useFocusEffect(
    useCallback(() => {
      let live = true
      void listGames(db, PAGE).then((page) => {
        if (!live) return
        setItems(page.items)
        setNext(page.next)
      })
      return () => {
        live = false
      }
    }, [db]),
  )

  async function loadMore() {
    if (!next) return
    const page = await more.run(async () => ({
      ok: true as const,
      view: await listGames(db, PAGE, next),
    }))
    if (!page) return
    setItems((now) => [...now, ...page.items])
    setNext(page.next)
  }

  return (
    <Screen title="Games">
      <GameRows games={items} onOpen={(id) => router.push(gameHref(id))} />
      {next ? (
        <Button label="More games" disabled={more.busy} onPress={() => void loadMore()} />
      ) : null}
      {more.error ? <ErrorLine text={more.error} /> : null}
    </Screen>
  )
}

/** A game by its id, once read; a missing one says so. */
export function GameScreen({ id }: { id: string }) {
  const { db } = useServices()
  const [game, setGame] = useState<DesktopGame | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void loadGame(db, id).then((g) => live && setGame(g))
    return () => {
      live = false
    }
  }, [db, id])
  if (game === undefined) return <View style={styles.fill} />
  if (game === null)
    return (
      <Screen title="Game">
        <EmptyState title="No such game" body="It may have been removed with a restore." />
      </Screen>
    )
  return <Game key={game.id} loaded={game} />
}

/**
 * A game against the computer (desktop-app D6, mobile-app D5): full screen, the board edge to edge, the moves as text
 * under it and the commands at the bottom. The person moves by tap or drag, the engine answers on its turn (also for a
 * game left in play), a move made on the engine's turn is a premove, and a move made on an earlier position plays on
 * from there, the later moves gone. A finished game offers a new one, the analysis board and its PGN, and its review
 * starts by itself.
 */
function Game({ loaded }: { loaded: DesktopGame }) {
  const services = useServices()
  const { db, evaluator } = services
  const { colors } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const [game, setGame] = useState(loaded)
  const [viewPly, setViewPly] = useState<number | null>(null)
  // The person's move, shown before it is saved.
  const [pending, setPending] = useState<{ fen: string; uci: string } | null>(null)
  const [premove, setPremove] = useState<SquarePair | null>(null)
  // The engine's answer reads the premove queued while it thought, not the one when it was asked.
  const queued = useRef<SquarePair | null>(null)
  const queue = (next: SquarePair | null) => {
    queued.current = next
    setPremove(next)
  }
  // The engine's failure, for the position it was asked about.
  const [failure, setFailure] = useState<{ fen: string; message: string } | null>(null)
  const [engine, setEngine] = useState<EngineState>(services.engine.state)
  const [orientation, setOrientation] = useState<Color>(loaded.personColor)
  const [menu, setMenu] = useState(false)
  const [confirmResign, setConfirmResign] = useState(false)
  // The engine's answer to a declined offer (draw, or a request to resign), until the next move.
  const [declined, setDeclined] = useState<string | null>(null)
  const command = useCommand()

  useEffect(() => services.engine.subscribe(setEngine), [services])

  // The review (game-review): run by itself once the game has ended, read while it runs (while the app is in front).
  const ended = game.status === 'ended'
  const loadReviewed = useCallback(() => loadReview(db, game.id), [db, game.id])
  const startReviewing = useCallback(
    () => startReview(db, evaluator, game.id),
    [db, evaluator, game.id],
  )
  const reviewing = useReview(null, loadReviewed, startReviewing, REVIEW_POLL_MS, ended, inFront)
  const reviewed = reviewing.view && reviewing.view.status !== 'none' ? reviewing.view : null
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const canReview = reviewable(game)
  // Started by itself once the game has ended (again on opening a game whose review was cut short).
  const startOnce = useRef(reviewing.start)
  startOnce.current = reviewing.start
  useEffect(() => {
    if (canReview) void startOnce.current()
  }, [canReview])

  // The engine's turn: asked whenever it is to move, also for a game left in play when the app closed. Once it has
  // answered, the premove queued meanwhile is played if it is still legal, else dropped.
  useEffect(() => {
    if (!engineToMove(game)) return
    let live = true
    const fail = (message: string) => {
      if (live) setFailure({ fen: game.fen, message })
    }
    engineMove(db, services.player, game.id)
      .then((next) => {
        if (!live || !next) return
        // No move came back for the same position: say so, rather than ask again and again.
        if (next.fen === game.fen && engineToMove(next)) return fail('The engine did not answer.')
        setGame(next)
        const wanted = queued.current
        if (!wanted || next.status !== 'playing' || toMove(next) !== next.personColor) return
        queue(null)
        const uci = resolvePremove(next.fen, wanted)
        if (uci) void play(uci, next.fen)
      })
      .catch((e: unknown) => fail(e instanceof Error ? e.message : 'The engine did not answer.'))
    return () => {
      live = false
    }
    // `play` is the render's own; the engine is asked again only for a new game state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, services, game])
  const engineError = failure?.fen === game.fen ? failure.message : null
  const thinking = engineToMove(game) && engineError === null

  const shownPly = viewPly ?? game.ply
  const fenAt = (ply: number) =>
    ply === 0 ? STANDARD_START : (game.moves[ply - 1]?.fenAfter ?? game.fen)
  const live = viewPly === null || viewPly === game.ply
  // The engine's better line, when one of its moves is tapped in the review, is shown on the board.
  const previewMove = preview ? reviewed?.moves[preview.ply - 1] : undefined
  const lined =
    preview && previewMove
      ? previewLine(fenAt(preview.ply - 1), previewMove.line, preview.upTo)
      : null
  const fen = lined?.fen ?? (pending && live ? pending.fen : fenAt(shownPly))
  const playing = game.status === 'playing'
  const side = game.personColor === 'white' ? 'w' : 'b'
  const myTurn = playing && !lined && !pending && !command.busy && fen.split(' ')[1] === side
  // On the engine's turn (or while the person's move is saved) a move is queued as a premove.
  const premoves = playing && live && !lined && !myTurn
  const engineLabel = engineName(game.level)

  // The evaluation while playing (the preferences' play switches, both off by default): the position shown, asked of
  // the one Stockfish at the quick think once it settles.
  const { preferences, update } = usePreferences()
  const [shown, setShown] = useState<EvaluationShown>({
    bar: preferences.playBar,
    line: preferences.playLines,
  })
  const evaluating = shown.bar || shown.line
  const [request] = useState(
    () => (input: Parameters<typeof evaluator.request>[0]) => evaluator.request(input),
  )
  const analysis = useAnalysis(request, 'quick')
  useAutoEvaluate(analysis, fen, evaluating)
  const evaluation = evaluating ? analysis.evaluationOf(fen) : null
  function show(next: EvaluationShown) {
    setShown(next)
    void update({ playBar: next.bar, playLines: next.line })
  }

  // Back to the position looked at in the move list, or else to before the person's last move; always to the
  // person's turn (a position with the engine to move goes one further back).
  const backTo =
    viewPly !== null && viewPly < game.ply
      ? viewPly > 0 && fenAt(viewPly).split(' ')[1] !== side
        ? viewPly - 1
        : viewPly
      : undefined

  async function play(uci: string, base = fen) {
    setDeclined(null)
    setPreview(null)
    const branch = live ? undefined : backTo
    const after = applyOptimistic(base, uci)
    if (after) setPending({ fen: after, uci })
    setViewPly(null)
    const next = await command.run(async () => {
      if (branch !== undefined) {
        const rewound = await takeBack(db, game.id, branch)
        if (!rewound.ok) return rewound
      }
      return personMove(db, game.id, uci)
    })
    if (next) {
      setGame(next)
      setViewPly(null)
    }
    setPending(null)
  }

  async function back() {
    queue(null)
    setDeclined(null)
    const next = await command.run(() => takeBack(db, game.id, backTo))
    if (next) {
      setGame(next)
      setViewPly(null)
    }
  }

  // A draw offer or a request to resign: the engine answers from the analysis engine's look at the position.
  async function offer(kind: 'draw' | 'resign') {
    setMenu(false)
    setDeclined(null)
    const answer = await command.run(() =>
      (kind === 'draw' ? offerDraw : askToResign)(db, evaluator, game.id),
    )
    if (!answer) return
    setGame(answer.game)
    if (!answer.accepted)
      setDeclined(
        kind === 'draw'
          ? `${engineLabel} declines the draw.`
          : `${engineLabel} does not resign: it plays on.`,
      )
  }

  async function giveUp() {
    setConfirmResign(false)
    queue(null)
    const next = await command.run(() => resign(db, game.id))
    if (next) setGame(next)
  }

  async function savePgn() {
    setMenu(false)
    if (!game.pgn) return
    await services.files.exportText(
      `chess-${game.createdAt.slice(0, 10)}-${game.id.slice(0, 8)}.pgn`,
      game.pgn,
    )
  }

  const top = orientation === 'white' ? 'black' : 'white'
  const nameOf = (color: Color) => (color === game.personColor ? PERSON_NAME : engineLabel)
  const status =
    engine === 'restarting'
      ? 'Stockfish is restarting…'
      : thinking
        ? `${engineLabel} is thinking…`
        : playing && myTurn
          ? live
            ? 'Your move.'
            : 'Your move from here: the later moves will be gone.'
          : null
  const step = (ply: number) => {
    setPreview(null)
    setViewPly(ply >= game.ply ? null : Math.max(0, ply))
  }
  const select = (ply: number) => {
    setPreview(null)
    setViewPly(ply === game.ply ? null : ply)
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.surfacePage, paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/play'))}
          style={styles.barButton}
        >
          <Text style={[styles.barGlyph, { color: colors.fgAccent }]}>‹</Text>
        </Pressable>
        <Text numberOfLines={1} style={[styles.barTitle, { color: colors.fgPrimary }]}>
          {versus(game.personColor, game.level)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More"
          onPress={() => setMenu(true)}
          style={styles.barButton}
        >
          <Text style={[styles.barGlyph, { color: colors.fgPrimary }]}>⋯</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}>
        <PlayerLine name={nameOf(top)} color={top} toMove={playing && toMove(game) === top} />
        {shown.bar ? (
          <View style={styles.evalBar}>
            <EvalBar evaluation={evaluation} orientation={orientation} />
          </View>
        ) : null}
        <Board
          fen={fen}
          orientation={orientation}
          size={width}
          side={game.personColor}
          lastMove={
            lined
              ? lined.lastMove
              : uciSquares(pending && live ? pending.uci : game.moves[shownPly - 1]?.uci)
          }
          premove={premove}
          {...(myTurn || premoves ? { onMove: (uci: string) => void play(uci) } : {})}
          {...(premoves ? { onPremove: queue } : {})}
        />
        <PlayerLine
          name={nameOf(orientation)}
          color={orientation}
          toMove={playing && toMove(game) === orientation}
          status={status}
        />
        <View style={styles.body}>
          <EngineStatus engine={services.engine} />
          {declined ? (
            <Text style={[styles.note, { color: colors.fgPrimary }]}>{declined}</Text>
          ) : null}
          {engineError ? <ErrorLine text={engineError} /> : null}
          {command.error ? <ErrorLine text={command.error} /> : null}
          {shown.line ? (
            <EngineLines
              fen={fen}
              evaluation={evaluation}
              error={analysis.error}
              {...(myTurn ? { onPlay: (line) => line[0] && void play(line[0].uci) } : {})}
            />
          ) : null}
          <MoveText sans={game.moves.map((m) => m.san)} viewPly={viewPly} onSelect={select} />
          <MoveNav
            onFirst={() => step(0)}
            onPrevious={() => step(shownPly - 1)}
            onNext={() => step(shownPly + 1)}
            onLast={() => setViewPly(null)}
          >
            <NavButton
              label="Flip board"
              glyph="⇅"
              onPress={() => setOrientation(orientation === 'white' ? 'black' : 'white')}
            />
          </MoveNav>
          {playing ? null : (
            <GameEnd
              game={game}
              onNewGame={() => router.navigate('/play')}
              onSavePgn={() => void savePgn()}
              onAnalyse={() => router.push(mobileRoute(`/analysis?game=${game.id}`) as Href)}
            />
          )}
          {ended ? (
            <ReviewPanel
              review={reviewing.view}
              mine={game.personColor}
              busy={reviewing.busy}
              error={reviewing.error}
              onStart={() => void reviewing.start()}
              current={shownPly}
              onSelect={select}
              preview={preview}
              onPreview={setPreview}
            />
          ) : null}
          {playing ? (
            <View style={styles.commands}>
              <Button
                label={backTo === undefined ? 'Take back' : 'Play from here'}
                grow
                disabled={
                  command.busy ||
                  pending !== null ||
                  (backTo === undefined && lastPersonPly(game) === 0)
                }
                onPress={() => void back()}
              />
              <Button
                label="Offer draw"
                grow
                disabled={command.busy}
                onPress={() => void offer('draw')}
              />
              <Button
                label="Resign"
                grow
                disabled={command.busy}
                onPress={() => setConfirmResign(true)}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
      <Sheet visible={menu} title="Game" onClose={() => setMenu(false)}>
        {playing ? (
          <EvaluationSwitches
            shown={shown}
            onChange={show}
            note="These ask the Stockfish you play between its moves: it works harder, which costs battery."
          />
        ) : null}
        {playing ? <Row label="Ask to resign" onPress={() => void offer('resign')} /> : null}
        {game.pgn ? <Row label="Save PGN" onPress={() => void savePgn()} /> : null}
      </Sheet>
      <Sheet
        visible={confirmResign}
        title="Resign this game?"
        onClose={() => setConfirmResign(false)}
      >
        <Text style={[styles.note, { color: colors.fgSecondary }]}>
          {`${engineLabel} wins, and the game is reviewed.`}
        </Text>
        <Button label="Resign the game" kind="primary" onPress={() => void giveUp()} />
        <Button label="Keep playing" onPress={() => setConfirmResign(false)} />
      </Sheet>
    </View>
  )
}

/** Whether the app is in front: a review is read again only then. */
const inFront = () => AppState.currentState !== 'background'

const styles = StyleSheet.create({
  fill: { flex: 1 },
  evalBar: { paddingHorizontal: 12, paddingBottom: 4 },
  inset: { paddingHorizontal: 14 },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: TOUCH, paddingHorizontal: 4 },
  barButton: { minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' },
  barGlyph: { fontSize: 26, lineHeight: 30 },
  barTitle: {
    flex: 1,
    fontFamily: FONTS.sansMedium,
    fontSize: TEXT.base.size,
    textAlign: 'center',
  },
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  note: { fontFamily: FONTS.sans, fontSize: TEXT.sm.size, lineHeight: TEXT.sm.lineHeight },
  commands: { flexDirection: 'row', gap: 8 },
})
