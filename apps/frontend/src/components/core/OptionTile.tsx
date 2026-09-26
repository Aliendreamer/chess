import type { ReactNode } from 'react'

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
