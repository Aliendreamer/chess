import type { ReactNode } from 'react'

export type PanelVariant = 'outlined' | 'filled' | 'quiet' | 'accent'

const VARIANTS: Record<PanelVariant, string> = {
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
  children?: ReactNode
}

/** A card. Accent is for the one thing per view that is "yours right now" (your seek, your invite). */
export function Panel({ title, meta, variant = 'outlined', className, children }: PanelProps) {
  return (
    <div
      className={['flex flex-col gap-2.5 rounded-card p-4', VARIANTS[variant], className]
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
