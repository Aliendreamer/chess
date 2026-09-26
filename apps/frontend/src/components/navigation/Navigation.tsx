import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'

export function Wordmark({ version }: { version?: string }) {
  return (
    <div className="flex items-baseline gap-2 px-2">
      <span className="font-display text-[30px] leading-none text-fg-primary italic">Chess</span>
      {version ? <span className="font-mono text-[10px] text-fg-muted">{version}</span> : null}
    </div>
  )
}

export function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label} className="flex flex-col gap-0.5">
      <div className="px-2 pb-1.5 text-2xs tracking-eyebrow text-fg-muted uppercase">{label}</div>
      {children}
    </nav>
  )
}

export interface NavItemProps {
  to: NonNullable<LinkProps['to']>
  label: string
  badge?: number | string
}

/** A router link; the router marks the current one (`data-status="active"`), styled as selected. */
export function NavItem({ to, label, badge }: NavItemProps) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: true }}
      className="flex w-full items-center justify-between gap-2 rounded-control p-2 text-base text-fg-body no-underline transition-colors duration-[120ms] hover:bg-surface-hover hover:text-fg-body data-[status=active]:bg-surface-selected data-[status=active]:text-fg-primary"
    >
      <span>{label}</span>
      {badge !== undefined ? (
        <span className="rounded-count bg-brass-400 px-1.5 py-px font-mono text-2xs text-fg-on-accent">
          {badge}
        </span>
      ) : null}
    </Link>
  )
}
