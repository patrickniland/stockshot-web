import { InputHTMLAttributes, ElementType, useRef, useState } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  scannerMode?: boolean
  onKeyboardFallback?: () => void
  Icon?: ElementType
}

export function Input({
  scannerMode = false,
  onKeyboardFallback,
  Icon,
  className = '',
  ...props
}: InputProps) {
  const [keyboardOverride, setKeyboardOverride] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    props.onBlur?.(e)
    if (scannerMode && !keyboardOverride) {
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  const activateKeyboard = () => {
    setKeyboardOverride(true)
    onKeyboardFallback?.()
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const deactivateKeyboard = () => {
    setKeyboardOverride(false)
  }

  const inputMode = scannerMode && !keyboardOverride ? 'none' : undefined

  return (
    <div className="flex flex-col gap-1">
      <div className="relative flex items-center">
        {Icon && (
          <span className="absolute left-3 text-slate-400 pointer-events-none">
            <Icon />
          </span>
        )}
        <input
          ref={inputRef}
          {...props}
          inputMode={inputMode}
          autoComplete={scannerMode ? 'off' : props.autoComplete}
          onBlur={handleBlur}
          className={[
            'w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white',
            'px-3 py-2 text-[var(--text-base)] text-slate-900 placeholder:text-slate-400',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-transparent',
            'touch-target',
            Icon ? 'pl-9' : '',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
        />
      </div>
      {scannerMode && (
        <button
          type="button"
          onClick={keyboardOverride ? deactivateKeyboard : activateKeyboard}
          className="self-start text-[var(--text-xs)] text-slate-400 hover:text-slate-600 underline underline-offset-2"
        >
          {keyboardOverride ? 'Back to scanner mode' : 'Use keyboard instead'}
        </button>
      )}
    </div>
  )
}
