// StockShot — Operator PIN entry
// Replaces the free-text operator field in Scan In / Scan Out.
// Shows 4-digit PIN inputs when no operator is active; shows name + clear when verified.

import { useState, useRef, useEffect } from 'react'
import { UserCircle, X } from '@phosphor-icons/react'
import useAppStore from '../store/useAppStore'

const PIN_LENGTH = 4

export default function OperatorPinEntry() {
  const currentOperator = useAppStore(s => s.currentOperator)
  const setCurrentOperator = useAppStore(s => s.setCurrentOperator)
  const verifyOperatorPin = useAppStore(s => s.verifyOperatorPin)
  const operators = useAppStore(s => s.operators)

  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''))
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const hasOperators = operators.some(o => o.isActive)

  // Auto-submit when all digits filled
  useEffect(() => {
    if (digits.every(d => d !== '')) {
      submit(digits.join(''))
    }
  }, [digits])

  async function submit(pin: string) {
    setStatus('loading')
    const result = await verifyOperatorPin(pin)
    if (result.ok) {
      setStatus('idle')
      setDigits(Array(PIN_LENGTH).fill(''))
    } else {
      setStatus('error')
      setDigits(Array(PIN_LENGTH).fill(''))
      setTimeout(() => {
        setStatus('idle')
        refs.current[0]?.focus()
      }, 800)
    }
  }

  function handleChange(i: number, val: string) {
    const v = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = v
    setDigits(next)
    if (v && i < PIN_LENGTH - 1) {
      refs.current[i + 1]?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, i: number) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus()
    }
  }

  function handleClear() {
    setCurrentOperator('')
    setDigits(Array(PIN_LENGTH).fill(''))
    setStatus('idle')
    setTimeout(() => refs.current[0]?.focus(), 50)
  }

  // Operator is active — show name + clear button
  if (currentOperator) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 rounded-[var(--radius-md)]">
        <UserCircle size={16} className="text-[var(--color-success)] flex-shrink-0" />
        <span className="flex-1 text-[var(--text-sm)] font-semibold text-[var(--color-success)]">{currentOperator}</span>
        <button
          onClick={handleClear}
          title="Sign out operator"
          className="text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer p-0.5 rounded"
        >
          <X size={13} />
        </button>
      </div>
    )
  }

  // No operators set up yet — show advisory
  if (!hasOperators) {
    return (
      <div className="px-3 py-2 bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 rounded-[var(--radius-md)]">
        <p className="text-[var(--text-xs)] text-[var(--color-warning)]">
          No operators configured. Ask an admin to set up operators in the Admin panel.
        </p>
      </div>
    )
  }

  // PIN entry
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={el => { refs.current[i] = el }}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(e, i)}
            disabled={status === 'loading'}
            className={[
              'w-10 h-10 text-center text-[16px] font-bold [caret-color:transparent] border-2 rounded-lg outline-none transition-colors',
              status === 'error'
                ? 'border-[var(--color-danger)] bg-[var(--color-danger)]/5'
                : d
                  ? 'border-[var(--color-brand)]'
                  : 'border-[var(--color-border)]',
            ].join(' ')}
          />
        ))}
        {status === 'loading' && (
          <span className="self-center text-[var(--text-xs)] text-slate-400 ml-1">Checking…</span>
        )}
        {status === 'error' && (
          <span className="self-center text-[var(--text-xs)] text-[var(--color-danger)] ml-1">Invalid PIN</span>
        )}
      </div>
      <p className="text-[var(--text-xs)] text-slate-400">Enter your 4-digit operator PIN</p>
    </div>
  )
}
