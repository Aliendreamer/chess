import { postCommand, readJson } from './upstream'
import type { ColourChoice, CommandOutcome } from '../games'
import type { MembersView } from '../members'
import type { InviteView } from '../play'

/** `GET /api/members`: every active member with their state, online first (club-members). */
export async function loadMembers(fetchImpl: typeof fetch): Promise<MembersView> {
  return readJson<MembersView>(await fetchImpl('/api/members'), 'GET /api/members')
}

/** `POST /api/challenges`: challenges an online member to a preset as `color` (challenges); 409 is an outcome. */
export function sendChallenge(
  fetchImpl: typeof fetch,
  challenge: { opponentId: number; timeControl: string; color: ColourChoice },
): Promise<CommandOutcome<InviteView>> {
  return postCommand<InviteView>(fetchImpl, '/api/challenges', challenge)
}

export type ChallengeAnswer = 'accept' | 'decline' | 'cancel'

/** `POST /api/challenges/{id}/accept|decline|cancel`: the invite as it now stands (accepted: with its game). */
export function answerChallenge(
  fetchImpl: typeof fetch,
  inviteId: string,
  answer: ChallengeAnswer,
): Promise<CommandOutcome<InviteView>> {
  return postCommand<InviteView>(fetchImpl, `/api/challenges/${inviteId}/${answer}`)
}
