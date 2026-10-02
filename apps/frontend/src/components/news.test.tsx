import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EventsNow, NewsList } from './news'
import type { ChessEvent, NewsItem } from '#/lib/news'

afterEach(cleanup)

const NOW = Date.parse('2026-10-02T15:00:00Z')

describe('NewsList', () => {
  const item: NewsItem = {
    id: 'n1',
    source: 'chessbase',
    sourceName: 'ChessBase',
    title: 'Jon Speelman at 70',
    url: 'https://en.chessbase.com/post/jon-speelman-70th-birthday',
    publishedAt: '2026-10-02T14:00:00Z',
  }

  it('links each headline out in a new tab, naming its source and age', () => {
    render(<NewsList items={[item]} nowMs={NOW} />)
    const link = screen.getByRole('link', { name: /Jon Speelman at 70/ })
    expect(link.getAttribute('href')).toBe(item.url)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.getAttribute('aria-label')).toBe('Jon Speelman at 70 (opens en.chessbase.com)')
    expect(screen.getByText('ChessBase · 1 h ago')).toBeTruthy()
  })

  it('says when there is no news yet', () => {
    render(<NewsList items={[]} nowMs={NOW} />)
    expect(screen.getByText('No news yet.')).toBeTruthy()
  })
})

describe('EventsNow', () => {
  const event = (over: Partial<ChessEvent> = {}): ChessEvent => ({
    id: 'e1',
    name: 'Test Open 2026',
    url: 'https://lichess.org/broadcast/test-open/e1',
    roundName: 'Round 3',
    roundUrl: 'https://lichess.org/broadcast/test-open/round-3/r3',
    ongoing: true,
    location: 'Geneva',
    fideTc: 'standard',
    startsAt: '2026-10-01T10:00:00Z',
    endsAt: null,
    ...over,
  })

  it('marks a live round and links to it on lichess', () => {
    render(<EventsNow events={[event()]} />)
    expect(screen.getByText('live')).toBeTruthy()
    expect(screen.getByText('Geneva · Classical · Round 3')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Test Open 2026/ }).getAttribute('href')).toBe(
      'https://lichess.org/broadcast/test-open/round-3/r3',
    )
  })

  it('links to the tournament when there is no round, and shows nothing without events', () => {
    const { container, rerender } = render(
      <EventsNow events={[event({ ongoing: false, roundUrl: null })]} />,
    )
    expect(screen.queryByText('live')).toBeNull()
    expect(screen.getByRole('link', { name: /Test Open 2026/ }).getAttribute('href')).toBe(
      'https://lichess.org/broadcast/test-open/e1',
    )
    rerender(<EventsNow events={[]} />)
    expect(container.textContent).toBe('')
  })
})
