import type { PlayerProfile } from '#/lib/players'
import { recordByCategory, scoreShare } from '#/lib/players'
import { CategoryDot } from '#/components/games'

/**
 * Player profiles (player-profiles): the record — totals, a win/draw/loss bar and a row per game type. Names link to
 * profiles through `PlayerLink` in `components/games.tsx`, where every list of games lives.
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

type Record = Pick<PlayerProfile, 'wins' | 'draws' | 'losses' | 'byTimeControl'>

export function PlayerStats({ record }: { record: Record }) {
  const games = record.wins + record.draws + record.losses
  if (games === 0) return <p className="m-0 text-sm text-fg-secondary">No finished games yet.</p>
  const share = scoreShare(record)
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 font-display text-display-xs" data-testid="record-total">
        {`${plural(record.wins, 'win', 'wins')} · ${plural(record.draws, 'draw', 'draws')} · ${plural(record.losses, 'loss', 'losses')}`}
      </p>
      <div
        role="img"
        aria-label={`${share.wins}% wins, ${share.draws}% draws, ${share.losses}% losses`}
        className="flex h-2 w-full overflow-hidden rounded-full bg-surface-inset"
      >
        <span className="bg-status-win" style={{ width: `${share.wins}%` }} />
        <span className="bg-status-draw" style={{ width: `${share.draws}%` }} />
        <span className="bg-status-loss" style={{ width: `${share.losses}%` }} />
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-2xs uppercase tracking-wide text-fg-muted">
            <th className="py-1.5 font-medium">Game type</th>
            <th className="py-1.5 text-right font-medium">Won</th>
            <th className="py-1.5 text-right font-medium">Drawn</th>
            <th className="py-1.5 text-right font-medium">Lost</th>
          </tr>
        </thead>
        <tbody>
          {recordByCategory(record.byTimeControl).map((r) => (
            <tr key={r.category} className="border-t border-line-divider">
              <th scope="row" className="py-2 text-left font-normal">
                <span className="flex items-center gap-2">
                  <CategoryDot category={r.category} />
                  {r.label}
                </span>
              </th>
              <td className="py-2 text-right font-mono">{r.wins}</td>
              <td className="py-2 text-right font-mono">{r.draws}</td>
              <td className="py-2 text-right font-mono">{r.losses}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
