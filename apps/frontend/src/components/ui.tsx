import { useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { ColourChoice, CommandOutcome } from '#/lib/games'
import { pieceSrc } from '#/lib/board'

export type ButtonVariant = 'primary' | 'outline' | 'secondary'
export type ButtonSize = 'sm' | 'md' | 'lg'

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-sans transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-45'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brass-400 font-medium text-fg-on-accent enabled:hover:bg-brass-300',
  outline: 'border border-line-accent font-medium text-fg-accent enabled:hover:bg-surface-hover',
  secondary: 'border border-line-strong text-fg-primary enabled:hover:bg-surface-hover',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-base',
  lg: 'px-[22px] py-3 text-base font-semibold',
}

/** The classes of a button, for a `<Link>` or `<a>` that should look like one. */
export function buttonClass(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  block = false,
): string {
  return [BASE, BUTTON_VARIANTS[variant], SIZES[size], block ? 'w-full flex-1' : '']
    .filter(Boolean)
    .join(' ')
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
}

/** Primary is the one main action per view (brass); outline is the accent secondary; secondary is quiet. */
export function Button({
  variant = 'secondary',
  size = 'md',
  block = false,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[buttonClass(variant, size, block), className].filter(Boolean).join(' ')}
      {...rest}
    />
  )
}

export interface ChipProps {
  selected?: boolean
  mono?: boolean
  shape?: 'pill' | 'square'
  onClick?: () => void
  children: ReactNode
}

/** A selectable filter or choice; `aria-pressed` carries the selection for assistive tech and tests. */
export function Chip({
  selected = false,
  mono = false,
  shape = 'pill',
  onClick,
  children,
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={[
        'cursor-pointer border text-sm transition-colors duration-[120ms]',
        shape === 'pill' ? 'rounded-pill px-3 py-1.5' : 'rounded-control px-3.5 py-2',
        selected
          ? 'border-line-accent bg-surface-accent-tint text-fg-primary'
          : 'border-line-default text-fg-body hover:bg-surface-hover',
        mono ? 'font-mono' : 'font-sans',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export interface OptionTileProps {
  /** The big serif figure: a time control, a level. */
  figure: ReactNode
  caption?: ReactNode
  selected?: boolean
  align?: 'start' | 'center'
  disabled?: boolean
  /** The accessible name, when figure + caption would not read well ("5+3Blitz"). */
  label?: string
  onClick?: () => void
}

export function OptionTile({
  figure,
  caption,
  selected = false,
  align = 'start',
  disabled = false,
  label,
  onClick,
}: OptionTileProps) {
  const center = align === 'center'
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex cursor-pointer flex-col gap-1 rounded-card border text-left text-fg-primary transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-45',
        center ? 'items-center py-3.5' : 'items-start px-3.5 py-[18px]',
        selected
          ? 'border-line-accent bg-surface-accent-tint'
          : 'border-line-default bg-surface-raised enabled:hover:border-line-accent',
      ].join(' ')}
    >
      <span className="font-display text-display-sm">{figure}</span>
      {caption ? (
        <span
          className={['text-xs text-fg-secondary', center ? 'font-mono' : 'font-sans'].join(' ')}
        >
          {caption}
        </span>
      ) : null}
    </button>
  )
}

export type PanelVariant = 'outlined' | 'filled' | 'quiet' | 'accent'

const PANEL_VARIANTS: Record<PanelVariant, string> = {
  outlined: 'border border-line-default',
  filled: 'border border-line-default bg-surface-card',
  quiet: 'bg-surface-raised',
  accent: 'border border-line-accent bg-surface-accent-soft',
}

export interface PanelProps {
  /** An uppercase eyebrow label. */
  title?: string
  /** A mono caption on the right of the eyebrow. */
  meta?: string
  variant?: PanelVariant
  className?: string
  testId?: string
  children?: ReactNode
}

/** A card. Accent is for the one thing per view that is "yours right now" (your seek, your invite). */
export function Panel({
  title,
  meta,
  variant = 'outlined',
  className,
  testId,
  children,
}: PanelProps) {
  return (
    <div
      data-testid={testId}
      className={['flex flex-col gap-2.5 rounded-card p-4', PANEL_VARIANTS[variant], className]
        .filter(Boolean)
        .join(' ')}
    >
      {title || meta ? (
        <div className="flex items-baseline justify-between gap-3">
          {title ? (
            <span className="text-2xs tracking-eyebrow text-fg-muted uppercase">{title}</span>
          ) : null}
          {meta ? <span className="font-mono text-2xs text-fg-muted">{meta}</span> : null}
        </div>
      ) : null}
      {children}
    </div>
  )
}

export interface SectionHeadingProps {
  /** `xl` is the page title (an h1); `sm` a section heading (an h2). */
  size?: 'sm' | 'xl'
  meta?: string
  className?: string
  children: ReactNode
}

export function SectionHeading({ size = 'sm', meta, className, children }: SectionHeadingProps) {
  const Heading = size === 'xl' ? 'h1' : 'h2'
  return (
    <div
      className={['flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1', className]
        .filter(Boolean)
        .join(' ')}
    >
      <Heading
        className={[
          'm-0 font-display font-normal',
          size === 'xl' ? 'text-display-xl' : 'text-display-xs',
        ].join(' ')}
      >
        {children}
      </Heading>
      {meta ? <span className="font-mono text-2xs text-fg-muted">{meta}</span> : null}
    </div>
  )
}

/** A refusal or failure, announced to assistive tech. */
export function ErrorText({ testId, children }: { testId?: string; children: ReactNode }) {
  return (
    <p role="status" className="m-0 text-sm text-status-loss" data-testid={testId}>
      {children}
    </p>
  )
}

export interface Command {
  busy: boolean
  error: string | null
  /** Runs one command: busy while it runs; a refusal becomes `error` and yields null. 5xx and 401 still throw. */
  run: <T>(call: () => Promise<CommandOutcome<T>>) => Promise<T | null>
}

/** The busy/error state every command button shares. */
export function useCommand(): Command {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run<T>(call: () => Promise<CommandOutcome<T>>): Promise<T | null> {
    setBusy(true)
    setError(null)
    try {
      const outcome = await call()
      if (outcome.ok) return outcome.view
      setError(outcome.error)
      return null
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

// The two kings are the board's Cburnett pieces (board-look); random keeps its die.
const COLOURS: ReadonlyArray<{ value: ColourChoice; icon: ReactNode; label: string }> = [
  {
    value: 'white',
    icon: <img src={pieceSrc('w', 'k')} alt="" className="size-7" />,
    label: 'White',
  },
  { value: 'random', icon: <span className="text-[28px] leading-none">⚄</span>, label: 'Random' },
  {
    value: 'black',
    icon: <img src={pieceSrc('b', 'k')} alt="" className="size-7" />,
    label: 'Black',
  },
]

/** White, Random or Black; `aria-pressed` carries the choice. */
export function ColourPicker({
  value,
  onChange,
}: {
  value: ColourChoice
  onChange: (colour: ColourChoice) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="Your colour">
      {COLOURS.map((c) => (
        <button
          key={c.value}
          type="button"
          aria-pressed={value === c.value}
          onClick={() => onChange(c.value)}
          className={`flex cursor-pointer items-center gap-3 rounded-card border px-4 py-3 text-fg-primary ${value === c.value ? 'border-line-accent bg-surface-accent-tint' : 'border-line-default bg-surface-raised hover:border-line-accent'}`}
        >
          <span aria-hidden className="grid size-7 place-items-center">
            {c.icon}
          </span>
          {c.label}
        </button>
      ))}
    </div>
  )
}
