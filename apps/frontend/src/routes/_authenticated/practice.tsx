import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import type { PracticeItem, PracticeNext } from '#/lib/review'
import { moveLabel, practiceSide, usePracticeBoard } from '#/lib/review'
import { getMyPractice, getPracticeNext, postPracticeResult } from '#/lib/server/api'
import { uciSquares } from '#/lib/board'
import { legalTargets } from '#/lib/moveInput'
import { pageTitle } from '#/lib/feedback'
import { dueText } from '#/components/trainer'
import { PracticeFeedback } from '#/components/review'
import { Board, PromotionPicker } from '#/components/games'
import { Button, ErrorText, Panel, SectionHeading, useCommand } from '#/components/ui'

/** Practice (game-review): the member's own mistakes from reviewed games, one due position at a time. */
export const Route = createFileRoute('/_authenticated/practice')({
  loader: async () => {
    const [next, summary] = await Promise.all([getPracticeNext(), getMyPractice()])
    return { next, summary }
  },
  head: () => ({ meta: [{ title: pageTitle('Practice') }] }),
  component: PracticePage,
})

function PracticePage() {
  const { next: first, summary } = Route.useLoaderData()
  const router = useRouter()
  const [next, setNext] = useState<PracticeNext>(first)
  const [run, setRun] = useState(0)

  async function nextPosition() {
    setNext(await getPracticeNext())
    setRun((r) => r + 1)
    void router.invalidate()
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <SectionHeading size="xl">Practice</SectionHeading>
        <p className="m-0 text-sm text-fg-secondary" data-testid="practice-summary">
          {`${summary.positions} ${summary.positions === 1 ? 'position' : 'positions'} from your games · ${summary.learned} learned · ${summary.due} due`}
        </p>
      </header>
      {next.item ? (
        <PracticePosition
          key={`${next.item.gameId}:${next.item.ply}:${run}`}
          item={next.item}
          onNext={() => void nextPosition()}
        />
      ) : (
        <Panel variant="accent" testId="practice-done">
          <p className="m-0 text-sm text-fg-primary">
            {next.nextDueAt
              ? `Nothing to practise now. The next position is due ${dueText(next.nextDueAt)}.`
              : 'No mistakes to practise yet: review a finished game and press “Practise my mistakes”.'}
          </p>
          <Link to="/games" className="text-sm text-fg-accent">
            Your games
          </Link>
        </Panel>
      )}
    </div>
  )
}

function PracticePosition({ item, onNext }: { item: PracticeItem; onNext: () => void }) {
  const recording = useCommand()
  const board = usePracticeBoard(item, (correct) => {
    void recording.run(() =>
      postPracticeResult({ data: { gameId: item.gameId, ply: item.ply, correct } }),
    )
  })
  const side = practiceSide(item.fen)
  const shownMove = board.answer ? uciSquares(item.bestLine[0]) : null
  return (
    <div className="grid grid-cols-1 items-start gap-6 shell:grid-cols-[minmax(0,var(--board-max))_minmax(0,360px)] shell:gap-8">
      <div className="flex max-w-(--board-max) flex-col gap-3" data-testid="practice-board">
        <Board
          fen={item.fen}
          orientation={side}
          lastMove={shownMove}
          selected={board.selected}
          targets={board.selected ? legalTargets(item.fen, board.selected) : []}
          {...(board.answer ? {} : { onSquareClick: board.onSquareClick, onDrop: board.onDrop })}
        />
        {board.promotion ? (
          <PromotionPicker
            color={side}
            onPick={board.pickPromotion}
            onCancel={board.cancelPromotion}
          />
        ) : null}
      </div>
      <Panel variant="filled" className="gap-3" testId="practice">
        <p className="m-0 font-display text-display-xs" data-testid="practice-question">
          {`You played ${moveLabel(item.ply, item.playedSan)} here. Find better.`}
        </p>
        <p className="m-0 text-xs text-fg-muted">
          {`${item.white} vs ${item.black}${item.playedAt ? ` · ${dueText(item.playedAt)}` : ''} · ${item.class}`}
          {' · '}
          <Link to="/games/$id" params={{ id: item.gameId }} className="text-fg-accent">
            the game
          </Link>
        </p>
        {board.answer ? (
          <>
            <PracticeFeedback fen={item.fen} answer={board.answer} bestLine={item.bestLine} />
            <Button variant="primary" disabled={recording.busy} onClick={onNext}>
              Next position
            </Button>
          </>
        ) : (
          <Button onClick={board.reveal}>Show answer</Button>
        )}
        {recording.error ? <ErrorText>{recording.error}</ErrorText> : null}
      </Panel>
    </div>
  )
}
