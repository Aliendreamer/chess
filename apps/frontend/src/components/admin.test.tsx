import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminMembers, BroadcastImportForm, DeadLetterList, LibraryImportForm } from './admin'
import type { AdminMember, DeadLetter } from '#/lib/admin'
import type { BroadcastRun } from '@chess/ui'

afterEach(cleanup)

const letter = (id: string, aggregateId: string): DeadLetter => ({
  id,
  groupId: 'chess.rm-games',
  aggregateId,
  seq: 4,
  kafkaKey: aggregateId,
  value: '{}',
  attempts: 5,
  lastError: 'ProjectionGapException: expected seq 3\n   at Chess.Backend.Projections.Run()',
  firstFailedAt: '2026-10-02T09:00:00Z',
  parkedAt: '2026-10-02T09:01:00Z',
})

describe('DeadLetterList', () => {
  it('says when nothing is parked', () => {
    render(<DeadLetterList letters={[]} onReplay={vi.fn()} />)
    expect(screen.getByText('Nothing is parked.')).toBeTruthy()
  })

  it('lists each record with its first error line and the whole error on demand', () => {
    render(<DeadLetterList letters={[letter('1', 'g1'), letter('2', 'g2')]} onReplay={vi.fn()} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getAllByText('ProjectionGapException: expected seq 3')).toHaveLength(2)
    expect(
      screen.getAllByText(/at Chess.Backend.Projections.Run/)[0]?.closest('details'),
    ).not.toBeNull()
    expect(screen.getAllByText('chess.rm-games')).toHaveLength(2)
  })

  it('replays one aggregate and shows how it went', async () => {
    const onReplay = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, applied: 3 })
      .mockResolvedValueOnce({ ok: false, error: 'still broken' })
    render(<DeadLetterList letters={[letter('1', 'g1'), letter('2', 'g2')]} onReplay={onReplay} />)
    const [first, second] = screen.getAllByRole('button', { name: /^Replay/ })

    fireEvent.click(first!)
    expect(await screen.findByText('Replayed 3.')).toBeTruthy()
    expect(onReplay).toHaveBeenCalledWith('chess.rm-games', 'g1')

    fireEvent.click(second!)
    expect(await screen.findByText('Failed again: still broken')).toBeTruthy()
  })
})

describe('LibraryImportForm (game-library)', () => {
  const PGN = [
    '[White "Anderssen"]\n[Black "Kieseritzky"]\n[Date "1851.??.??"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
    '[White "Morphy"]\n[Black "Duke"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 1-0',
  ].join('\n\n')

  function fill(text: string) {
    fireEvent.change(screen.getByRole('textbox', { name: 'PGN' }), { target: { value: text } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Source' }), {
      target: { value: 'PGN Mentor' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Licence' }), {
      target: { value: 'moves only (facts)' },
    })
  }

  it('sends the parsed games with their source and reports what happened to each', async () => {
    const onImport = vi.fn().mockResolvedValue({
      ok: true,
      view: {
        imported: 1,
        duplicates: 0,
        refused: 1,
        items: [
          { index: 0, status: 'imported' },
          { index: 1, status: 'refused', error: 'Illegal move 4 (d7d6)' },
        ],
      },
    })
    render(<LibraryImportForm onImport={onImport} />)
    fill(PGN)
    fireEvent.click(screen.getByRole('checkbox', { name: 'World Championship games' }))
    fireEvent.click(screen.getByRole('button', { name: 'Import to library' }))

    expect(await screen.findByText('Imported 1 · duplicates 0 · refused 1')).toBeTruthy()
    expect(screen.getByText('Game 2: Illegal move 4 (d7d6)')).toBeTruthy()
    const batch = onImport.mock.calls[0]![0]
    expect(batch).toMatchObject({
      source: 'PGN Mentor',
      licence: 'moves only (facts)',
      worldChampionship: true,
    })
    expect(batch.games.map((g: { white: string }) => g.white)).toEqual(['Anderssen', 'Morphy'])
  })

  it('stops and says why when the API refuses the batch', async () => {
    const onImport = vi.fn().mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' })
    render(<LibraryImportForm onImport={onImport} />)
    fill(PGN)
    fireEvent.click(screen.getByRole('button', { name: 'Import to library' }))
    expect(await screen.findByText('Forbidden')).toBeTruthy()
  })

  it('needs a source and a licence', () => {
    render(<LibraryImportForm onImport={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'PGN' }), { target: { value: PGN } })
    expect(screen.getByRole('button', { name: 'Import to library' }).hasAttribute('disabled')).toBe(
      true,
    )
  })

  it('says so when the text holds no game at all', async () => {
    const onImport = vi.fn()
    render(<LibraryImportForm onImport={onImport} />)
    fill('this is not a PGN file')
    fireEvent.click(screen.getByRole('button', { name: 'Import to library' }))
    expect(await screen.findByText('No PGN game was found in that text.')).toBeTruthy()
    expect(onImport).not.toHaveBeenCalled()
  })
})

describe('BroadcastImportForm', () => {
  const finished: BroadcastRun = {
    id: 'r1',
    month: '2026-08',
    state: 'finished',
    read: 48940,
    kept: 2340,
    imported: 2300,
    duplicate: 0,
    refused: 40,
    error: null,
    startedAt: '2026-10-05T10:00:00Z',
    finishedAt: '2026-10-05T10:04:00Z',
  }

  it('starts the chosen month and shows what each run did', async () => {
    const onStart = vi.fn().mockResolvedValue({ ok: true, view: { runId: 'r2' } })
    render(
      <BroadcastImportForm months={['2026-09', '2026-08']} runs={[finished]} onStart={onStart} />,
    )
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2026-08' } })
    fireEvent.click(screen.getByRole('button', { name: 'Import the month' }))
    await vi.waitFor(() => expect(onStart).toHaveBeenCalledWith('2026-08'))
    const row = screen.getByRole('row', { name: /2026-08/ })
    expect(row.textContent).toContain('finished')
    expect(row.textContent).toContain('48,940')
    expect(row.textContent).toContain('2,300')
  })

  it('shows a refusal, such as another month running', async () => {
    const onStart = vi.fn().mockResolvedValue({ ok: false, error: 'A month is being imported.' })
    render(<BroadcastImportForm months={['2026-09']} runs={[]} onStart={onStart} />)
    fireEvent.click(screen.getByRole('button', { name: 'Import the month' }))
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'A month is being imported.',
    )
    expect(screen.getByText('No month imported yet.')).toBeTruthy()
  })

  it('shows why a run failed', () => {
    render(
      <BroadcastImportForm
        months={['2026-09']}
        runs={[{ ...finished, state: 'failed', error: 'lichess answered 404 for 2026-08.' }]}
        onStart={vi.fn()}
      />,
    )
    expect(screen.getByText('lichess answered 404 for 2026-08.')).toBeTruthy()
  })
})

describe('AdminMembers (member-admin)', () => {
  const member = (id: number, username: string, over: Partial<AdminMember> = {}): AdminMember => ({
    id,
    username,
    fullName: `${username} Doe`,
    email: null,
    active: true,
    admin: false,
    createdAt: '2026-10-01T09:00:00Z',
    lastSeenAt: null,
    ...over,
  })
  const ann = member(1, 'ann', { admin: true })
  const bob = member(2, 'bob')

  const rowOf = (name: string) =>
    screen.getAllByTestId('admin-member').find((r) => r.getAttribute('data-member') === name)!

  function renderMembers(over: Partial<Parameters<typeof AdminMembers>[0]> = {}) {
    const props = {
      members: [ann, bob],
      meId: 1,
      onCreate: vi.fn(),
      onAction: vi.fn(),
      onResetPassword: vi.fn(),
      ...over,
    }
    render(<AdminMembers {...props} />)
    return props
  }

  it('lists members with their badges and keeps admins from harming themselves', () => {
    renderMembers({ members: [ann, bob, member(3, 'cid', { active: false })] })
    expect(within(rowOf('ann')).getByText('Admin')).toBeDefined()
    expect(within(rowOf('bob')).getByText('Active')).toBeDefined()
    expect(within(rowOf('cid')).getByText('Deactivated')).toBeDefined()
    const disabled = (name: string) => screen.getByRole('button', { name }).hasAttribute('disabled')
    expect(disabled('Deactivate ann')).toBe(true)
    expect(disabled('Remove admin from ann')).toBe(true)
    expect(disabled("Reset ann's password")).toBe(false)
    expect(disabled('Deactivate bob')).toBe(false)
    expect(disabled('Make bob an admin')).toBe(false)
    expect(disabled('Reactivate cid')).toBe(false)
  })

  it('creates a member and shows the temporary password once', async () => {
    const carol = member(4, 'carol')
    const onCreate = vi.fn().mockResolvedValue({
      ok: true,
      view: { member: carol, temporaryPassword: 'Tmp-pass-1234567' },
    })
    renderMembers({ onCreate })
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'carol' } })
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Carol Doe' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create member' }))

    expect((await screen.findByTestId('temporary-password-value')).textContent).toBe(
      'Tmp-pass-1234567',
    )
    expect(
      screen.getByText('Give this to carol; they choose their own at first sign-in.'),
    ).toBeDefined()
    expect(onCreate).toHaveBeenCalledWith({ username: 'carol', fullName: 'Carol Doe', email: null })
    expect(rowOf('carol')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByTestId('temporary-password')).toBeNull()
  })

  it('shows a refused creation', async () => {
    renderMembers({
      onCreate: vi.fn().mockResolvedValue({ ok: false, status: 409, error: 'carol is taken.' }),
    })
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'carol' } })
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Carol' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create member' }))
    expect((await screen.findByRole('alert')).textContent).toBe('carol is taken.')
  })

  it('deactivates a member and shows the row as the server answered', async () => {
    const onAction = vi.fn().mockResolvedValue({ ok: true, view: { ...bob, active: false } })
    renderMembers({ onAction })
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate bob' }))
    expect(await within(rowOf('bob')).findByText('Deactivated')).toBeDefined()
    expect(onAction).toHaveBeenCalledWith(2, 'deactivate')
    expect(screen.getByRole('button', { name: 'Reactivate bob' })).toBeDefined()
  })

  it('resets a password and shows the new one in its row', async () => {
    const onResetPassword = vi
      .fn()
      .mockResolvedValue({ ok: true, view: { temporaryPassword: 'New-pass-7654321' } })
    renderMembers({ onResetPassword })
    fireEvent.click(screen.getByRole('button', { name: "Reset bob's password" }))
    expect((await within(rowOf('bob')).findByTestId('temporary-password-value')).textContent).toBe(
      'New-pass-7654321',
    )
    expect(onResetPassword).toHaveBeenCalledWith(2)
  })
})
