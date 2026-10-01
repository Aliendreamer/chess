import { useEffect } from 'react'
import { myColor } from './games'
import type { GameView } from './games'
import type { InviteView } from './play'

/**
 * Feedback moments (game-feedback): what the tab says about the open game, and where a rematch stands. Client-safe
 * and pure, except `useTabSignals`, which writes the decision into the document.
 */

export const FAVICON = '/favicon.svg'
export const FAVICON_TURN = '/favicon-turn.svg'
export const SITE_TITLE = 'Chess'

export interface TabState {
  title: string
  /** True when the player is needed: the favicon gets its dot. */
  turn: boolean
}

export function tabState(
  view: Pick<GameView, 'whiteId' | 'blackId' | 'status' | 'sideToMove' | 'drawOfferedBy'>,
  meId: number,
  names: { white: string; black: string },
): TabState {
  const plain = { title: `${names.white} vs ${names.black} · ${SITE_TITLE}`, turn: false }
  const mine = myColor(view, meId)
  if (mine === null || view.status === 'ended') return plain
  const opponent = mine === 'white' ? names.black : names.white
  const opponentId = mine === 'white' ? view.blackId : view.whiteId
  if (view.drawOfferedBy === opponentId)
    return { title: `● Draw offered · vs ${opponent}`, turn: true }
  if (view.sideToMove.toLowerCase() === mine)
    return { title: `● Your move · vs ${opponent}`, turn: true }
  return plain
}

/** Puts `state` into the tab (title and favicon) while the page is open, and restores the plain tab after. */
export function useTabSignals(state: TabState): void {
  useEffect(() => {
    document.title = state.title
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (icon) icon.href = state.turn ? FAVICON_TURN : FAVICON
  }, [state.title, state.turn])
  useEffect(
    () => () => {
      document.title = SITE_TITLE
      const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      if (icon) icon.href = FAVICON
    },
    [],
  )
}

/** Where the rematch of a finished game stands for me, from its `invite:{gameId}` view (undefined: nobody asked). */
export type RematchState =
  | { kind: 'none' }
  | { kind: 'offered' }
  | { kind: 'asked' }
  | { kind: 'started'; gameId: string }
  | { kind: 'gone' }

export function rematchState(invite: InviteView | undefined, meId: number): RematchState {
  if (!invite) return { kind: 'none' }
  if (invite.status === 'accepted' && invite.gameId)
    return { kind: 'started', gameId: invite.gameId }
  if (invite.status !== 'open') return { kind: 'gone' }
  return invite.creatorId === meId ? { kind: 'offered' } : { kind: 'asked' }
}
