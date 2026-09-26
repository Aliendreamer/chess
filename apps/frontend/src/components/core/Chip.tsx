import type { ReactNode } from 'react'

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
