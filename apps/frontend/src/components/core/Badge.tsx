import type { ReactNode } from 'react'

export type BadgeTone = 'count' | 'status' | 'tag'

const TONES: Record<BadgeTone, string> = {
  count: 'rounded-count bg-brass-400 px-1.5 py-px font-mono text-2xs text-fg-on-accent',
  status: 'font-mono text-2xs text-status-healthy',
  tag: 'rounded-control bg-surface-selected px-2.5 py-1.5 text-sm text-fg-primary',
}

export interface BadgeProps {
  tone?: BadgeTone
  /** A leading dot in the current colour (status). */
  dot?: boolean
  className?: string
  children: ReactNode
}

export function Badge({ tone = 'count', dot = false, className, children }: BadgeProps) {
  return (
    <span
      className={['inline-flex items-center gap-1.5 leading-[1.4]', TONES[tone], className]
        .filter(Boolean)
        .join(' ')}
    >
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  )
}
