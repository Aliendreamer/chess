import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Button,
  Chip,
  ColourPicker,
  ErrorText,
  LoadMore,
  OptionTile,
  Panel,
  SectionHeading,
  buttonClass,
  useAdoptTyped,
  useCommand,
} from './ui'

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

describe('OptionTile bar (site-themes)', () => {
  it('draws the coloured bar only when given one', () => {
    const { container, rerender } = render(
      <OptionTile figure="3+2" caption="Blitz" bar="bg-tc-blitz" />,
    )
    expect(container.querySelector('.bg-tc-blitz')).not.toBeNull()
    rerender(<OptionTile figure="3+2" caption="Blitz" />)
    expect(container.querySelector('[class*="bg-tc-"]')).toBeNull()
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

describe('useCommand', () => {
  it('returns the view of an accepted command and clears the last error', async () => {
    const { result } = renderHook(() => useCommand())
    await act(async () => {
      await result.current.run(() =>
        Promise.resolve({ ok: false, status: 409, error: 'The game is over.' }),
      )
    })
    expect(result.current.error).toBe('The game is over.')

    let view: number | null = null
    await act(async () => {
      view = await result.current.run(() => Promise.resolve({ ok: true as const, view: 7 }))
    })
    expect(view).toBe(7)
    expect(result.current.error).toBeNull()
  })

  it('turns a refusal into its error and yields null', async () => {
    const { result } = renderHook(() => useCommand())
    let view: unknown = 'unset'
    await act(async () => {
      view = await result.current.run(() =>
        Promise.resolve({ ok: false, status: 422, error: 'Illegal move.' }),
      )
    })
    expect(view).toBeNull()
    expect(result.current.error).toBe('Illegal move.')
  })

  it('is busy while the command runs, and not after it throws', async () => {
    const { result } = renderHook(() => useCommand())
    let finish: (value: { ok: true; view: number }) => void = () => {}
    let running: Promise<number | null> = Promise.resolve(null)
    act(() => {
      running = result.current.run(() => new Promise((resolve) => (finish = resolve)))
    })
    expect(result.current.busy).toBe(true)
    await act(async () => {
      finish({ ok: true, view: 1 })
      await running
    })
    expect(result.current.busy).toBe(false)

    await act(async () => {
      await expect(result.current.run(() => Promise.reject(new Error('500')))).rejects.toThrow(
        '500',
      )
    })
    expect(result.current.busy).toBe(false)
  })
})

describe('ErrorText', () => {
  it('is announced as an alert', () => {
    render(<ErrorText testId="e">Not your turn.</ErrorText>)
    expect(screen.getByRole('alert').textContent).toBe('Not your turn.')
  })
})

describe('ColourPicker', () => {
  it('shows the choice as pressed and reports a new one', () => {
    const onChange = vi.fn()
    render(<ColourPicker value="random" onChange={onChange} />)
    expect(screen.getByRole('button', { name: /Random/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /Black/ }))
    expect(onChange).toHaveBeenCalledWith('black')
  })
})

describe('LoadMore', () => {
  const pager = (
    over: Partial<{ hasMore: boolean; busy: boolean; error: string | null }> = {},
  ) => ({
    hasMore: true,
    busy: false,
    error: null,
    more: vi.fn(() => Promise.resolve()),
    ...over,
  })

  it('asks for more, and says it is loading', () => {
    const p = pager()
    const { rerender } = render(<LoadMore pager={p} />)
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(p.more).toHaveBeenCalled()
    rerender(<LoadMore pager={pager({ busy: true })} />)
    expect(screen.getByRole('button', { name: 'Loading…' }).hasAttribute('disabled')).toBe(true)
  })

  it('shows the error, and nothing once the list is complete', () => {
    const { rerender } = render(
      <LoadMore pager={pager({ error: 'The next page could not be loaded.' })} />,
    )
    expect(screen.getByText('The next page could not be loaded.')).toBeTruthy()
    rerender(<LoadMore pager={pager({ hasMore: false })} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('OptionTile figure size (ui-polish)', () => {
  it('draws a long word smaller so it fits', () => {
    render(<OptionTile figure="Maximum" figureSize="sm" label="Level Maximum" />)
    const figure = screen.getByText('Maximum')
    expect(figure.className).toContain('text-display-xs')
    expect(figure.className).toContain('break-words')
  })
})

describe('useAdoptTyped', () => {
  it('adopts text that was in the field before the page hydrated, once', () => {
    const adopted: Array<string> = []
    function Field() {
      const ref = useAdoptTyped<HTMLInputElement>((v) => adopted.push(v))
      return <input aria-label="Field" ref={ref} defaultValue="typed early" />
    }
    render(<Field />)
    expect(adopted).toEqual(['typed early'])
  })

  it('adopts nothing from an empty field', () => {
    const adopted: Array<string> = []
    function Field() {
      const ref = useAdoptTyped<HTMLInputElement>((v) => adopted.push(v))
      return <input aria-label="Field" ref={ref} defaultValue="" />
    }
    render(<Field />)
    expect(adopted).toEqual([])
  })
})
