import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChallengeBanner, ChallengeForm, ChallengeStatus, MemberList } from './members'
import type { ReactNode } from 'react'
import type { Challenge, Member } from '#/lib/members'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: { children: ReactNode; to: string; params: { id: string } }) => (
    <a href={to.replace('$id', params.id)}>{children}</a>
  ),
}))

afterEach(cleanup)

const NOW = Date.parse('2026-10-13T12:00:00Z')

const members: Array<Member> = [
  { id: 7, username: 'me', state: 'online', lastSeenAt: null },
  { id: 8, username: 'bob', state: 'online', lastSeenAt: null },
  { id: 9, username: 'carol', state: 'playing', lastSeenAt: null },
  { id: 10, username: 'dave', state: 'offline', lastSeenAt: '2026-10-13T09:00:00Z' },
]

const row = (name: string) =>
  screen.getAllByTestId('member-row').find((r) => r.getAttribute('data-member') === name)!

describe('MemberList', () => {
  it('names each state in words, links names to profiles and says when an offline member was seen', () => {
    render(
      <MemberList
        members={members}
        meId={7}
        presenceKnown
        now={NOW}
        mayChallenge
        openFor={null}
        onChallenge={vi.fn()}
      />,
    )
    expect(within(row('bob')).getByTestId('member-state').textContent).toBe('Online')
    expect(within(row('carol')).getByTestId('member-state').textContent).toBe('Playing')
    expect(within(row('dave')).getByText('last seen 3 h ago')).toBeDefined()
    expect(within(row('bob')).getByRole('link', { name: 'bob' }).getAttribute('href')).toBe(
      '/players/8',
    )
    expect(row('bob').querySelector('[data-state="online"]')).not.toBeNull()
  })

  it('offers Challenge to online members who are not me and not playing', () => {
    const onChallenge = vi.fn()
    render(
      <MemberList
        members={members}
        meId={7}
        presenceKnown
        now={NOW}
        mayChallenge
        openFor={null}
        onChallenge={onChallenge}
      />,
    )
    const buttons = screen.getAllByRole('button', { name: /^Challenge / })
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Challenge bob'])
    fireEvent.click(buttons[0]!)
    expect(onChallenge).toHaveBeenCalledWith(members[1])
  })

  it('opens the form under the chosen row, and holds Challenge while one is out', () => {
    render(
      <MemberList
        members={members}
        meId={7}
        presenceKnown
        now={NOW}
        mayChallenge={false}
        openFor={8}
        panel={<p>the form</p>}
        onChallenge={vi.fn()}
      />,
    )
    expect(within(row('bob')).getByText('the form')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Challenge bob' }).hasAttribute('disabled')).toBe(
      true,
    )
  })

  it('offers no challenge when presence is unknown', () => {
    render(
      <MemberList
        members={members}
        meId={7}
        presenceKnown={false}
        now={NOW}
        mayChallenge
        openFor={null}
        onChallenge={vi.fn()}
      />,
    )
    expect(screen.queryAllByRole('button', { name: /^Challenge / })).toHaveLength(0)
  })
})

describe('ChallengeForm', () => {
  it('picks a preset and a colour, then sends', () => {
    const onTimeControl = vi.fn()
    const onColor = vi.fn()
    const onSend = vi.fn()
    render(
      <ChallengeForm
        opponent="bob"
        timeControl="5+3"
        color="random"
        busy={false}
        error="bob is playing."
        onTimeControl={onTimeControl}
        onColor={onColor}
        onSend={onSend}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: '5+3' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '3+2' }))
    fireEvent.click(screen.getByRole('button', { name: /Black/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onTimeControl).toHaveBeenCalledWith('3+2')
    expect(onColor).toHaveBeenCalledWith('black')
    expect(onSend).toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('bob is playing.')
  })
})

describe('ChallengeStatus', () => {
  const props = { opponent: 'bob', now: NOW, busy: false, error: null, onDismiss: vi.fn() }

  it('waits with a countdown and Cancel', () => {
    const onCancel = vi.fn()
    render(
      <ChallengeStatus
        {...props}
        state={{ kind: 'waiting', expiresAt: '2026-10-13T12:00:42Z' }}
        onCancel={onCancel}
      />,
    )
    expect(screen.getByText(/Waiting for bob…/)).toBeDefined()
    expect(screen.getByTestId('challenge-countdown').textContent).toBe('0:42')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('says how it ended', () => {
    const { rerender } = render(
      <ChallengeStatus {...props} state={{ kind: 'declined' }} onCancel={vi.fn()} />,
    )
    expect(screen.getByText('bob declined.')).toBeDefined()
    rerender(<ChallengeStatus {...props} state={{ kind: 'expired' }} onCancel={vi.fn()} />)
    expect(screen.getByText('No answer from bob.')).toBeDefined()
  })
})

describe('ChallengeBanner', () => {
  const challenge: Challenge = {
    inviteId: 'i1',
    fromId: 8,
    from: 'alice',
    timeControl: '5+3',
    color: 'white',
    expiresAt: '2026-10-13T12:00:42Z',
  }

  it('shows nothing without challenges', () => {
    render(
      <ChallengeBanner
        challenges={[]}
        now={NOW}
        busy={false}
        error={null}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('challenge-banner')).toBeNull()
  })

  it('names the challenge with its countdown, and accepts or declines it', () => {
    const onAccept = vi.fn()
    const onDecline = vi.fn()
    render(
      <ChallengeBanner
        challenges={[challenge]}
        now={NOW}
        busy={false}
        error={null}
        onAccept={onAccept}
        onDecline={onDecline}
      />,
    )
    const banner = screen.getByTestId('challenge-banner')
    expect(
      within(banner).getByText('alice challenges you to Blitz 5+3, you play black'),
    ).toBeDefined()
    expect(within(banner).getByText('0:42')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: "Accept alice's challenge" }))
    fireEvent.click(screen.getByRole('button', { name: "Decline alice's challenge" }))
    expect(onAccept).toHaveBeenCalledWith(challenge)
    expect(onDecline).toHaveBeenCalledWith(challenge)
  })

  it('keeps a refusal in view even when no challenge is left', () => {
    render(
      <ChallengeBanner
        challenges={[]}
        now={NOW}
        busy={false}
        error="The challenge has expired."
        onAccept={vi.fn()}
        onDecline={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert').textContent).toBe('The challenge has expired.')
  })
})
