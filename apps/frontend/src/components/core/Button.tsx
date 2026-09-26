import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'outline' | 'secondary'
export type ButtonSize = 'sm' | 'md' | 'lg'

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-sans transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-45'

const VARIANTS: Record<ButtonVariant, string> = {
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
  return [BASE, VARIANTS[variant], SIZES[size], block ? 'w-full flex-1' : '']
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
