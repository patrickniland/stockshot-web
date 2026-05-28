import { ButtonHTMLAttributes, ElementType } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  Icon?: ElementType
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-[var(--color-brand)] text-white hover:opacity-90',
  secondary: 'bg-white border border-[var(--color-border)] text-slate-900 hover:bg-slate-50',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
  danger: 'bg-[var(--color-danger)] text-white hover:opacity-90',
}

const sizeClasses: Record<Size, string> = {
  sm: 'min-h-8 px-3 text-[var(--text-sm)] gap-1.5',
  md: 'min-h-11 px-4 text-[var(--text-base)] gap-2 touch-target',
  lg: 'min-h-12 px-5 text-[var(--text-lg)] gap-2 touch-target',
}

export function Button({
  variant = 'primary',
  size = 'md',
  Icon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center rounded-[var(--radius-md)] font-medium transition-opacity select-none',
        variantClasses[variant],
        sizeClasses[size],
        disabled ? 'opacity-50 cursor-not-allowed' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {Icon && <Icon />}
      {children}
    </button>
  )
}
