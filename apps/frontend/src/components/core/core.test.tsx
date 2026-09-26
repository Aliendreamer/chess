import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button, buttonClass } from './Button'
import { Chip } from './Chip'
import { OptionTile } from './OptionTile'
import { Panel, SectionHeading } from './Panel'

afterEach(cleanup)

describe('Button', () => {
  it('is a non-submitting button that clicks', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Resign</Button>)
    const button = screen.getByRole('button', { name: 'Resign' })
    fireEvent.click(button)
    expect(button.getAttribute('type')).toBe('button')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not click when disabled', () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Resign
      </Button>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Resign' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('primary is the brass action; block fills the row', () => {
    expect(buttonClass('primary')).toContain('bg-brass-400')
    expect(buttonClass('secondary')).not.toContain('bg-brass-400')
    expect(buttonClass('secondary', 'md', true)).toContain('w-full')
  })
})

describe('Chip and OptionTile', () => {
  it('expose their selection as aria-pressed', () => {
    render(
      <>
        <Chip selected>5+3</Chip>
        <Chip>10+0</Chip>
        <OptionTile figure="3+2" caption="Blitz" selected />
      </>,
    )
    expect(screen.getByRole('button', { name: '5+3' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '10+0' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: /3\+2/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('a disabled tile does not click', () => {
    const onClick = vi.fn()
    render(<OptionTile figure="1+0" caption="Bullet" disabled onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: /1\+0/ }))
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('Panel and SectionHeading', () => {
  it('xl is the page h1, sm a section h2', () => {
    render(
      <>
        <SectionHeading size="xl">Hello, ann.</SectionHeading>
        <SectionHeading meta="3 games">Recent games</SectionHeading>
      </>,
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hello, ann.')
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Recent games')
    expect(screen.getByText('3 games')).toBeDefined()
  })

  it('shows its eyebrow and meta', () => {
    render(
      <Panel title="Your seek" meta="5+3" variant="accent">
        waiting
      </Panel>,
    )
    expect(screen.getByText('Your seek')).toBeDefined()
    expect(screen.getByText('5+3')).toBeDefined()
  })
})
