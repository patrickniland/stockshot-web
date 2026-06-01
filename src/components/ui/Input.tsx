import { InputHTMLAttributes, ElementType, useRef, useState, forwardRef, useCallback } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  scannerMode?: boolean
  onKeyboardFallback?: () => void
  Icon?: ElementType
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({
  scannerMode = false,
  onKeyboardFallback,
  Icon,
  className = '',
  ...props
}, ref) {
  const [keyboardOverride, setKeyboardOverride] = useState(false)
  const internalRef = useRef<HTMLInputElement>(null)

  const setRefs = useCallback((el: HTMLInputElement | null) => {
    (internalRef as React.MutableRefObject<HTMLInputElement | null>).current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el
  }, [ref])

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    props.onBlur?.(e)
    if (scannerMode && !keyboardOverride) {
      setTimeout(() => internalRef.current?.focus(), 0)
    }
  }

  const activateKeyboard = () => {
    setKeyboardOverride(true)
    onKeyboardFallback?.()
    setTimeout(() => internalRef.current?.focus(), 0)
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
          ref={setRefs}
          {...props}
          inputMode={inputMode}
          autoComplete={scannerMode ? 'off' : props.autoComplete}
          onBlur={handleBlur}
          className={[
            'w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white',
            'px-3 py-2 text-slate-900 placeholder:text-slate-400',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-transparent',
            'touch-target',
            Icon ? 'pl-9' : '',
            className,
          ].filter(Boolean).join(' ')}
        />
      </div>
      {scannerMode && (
        <button
          type="button"
          onClick={keyboardOverride ? () => setKeyboardOverride(false) : activateKeyboard}
          className="self-start text-[var(--text-xs)] text-slate-400 hover:text-slate-600 underline underline-offset-2"
        >
          {keyboardOverride ? 'Back to scanner mode' : 'Use keyboard instead'}
        </button>
      )}
    </div>
  )
})
