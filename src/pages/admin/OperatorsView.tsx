// StockShot — Admin: Operators

import { useState, useRef } from 'react'
import { UserCircle, Plus, Key, Prohibit, Check } from '@phosphor-icons/react'
import useAppStore from '../../store/useAppStore'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'

const PIN_LENGTH = 4
const OBVIOUS_PINS = new Set(['0000','1111','2222','3333','4444','5555','6666','7777','8888','9999','1234','4321','0123','9876'])

function PinInputs({ digits, refs, onChange, onKeyDown, disabled }: {
  digits: string[]
  refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  onChange: (i: number, v: string) => void
  onKeyDown: (e: React.KeyboardEvent, i: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          type="password" inputMode="numeric" maxLength={1}
          value={d}
          onChange={e => onChange(i, e.target.value.replace(/\D/g, '').slice(-1))}
          onKeyDown={e => onKeyDown(e, i)}
          disabled={disabled}
          className={`w-10 h-11 text-center text-[18px] font-bold [caret-color:transparent] border-2 rounded-lg outline-none transition-colors ${
            d ? 'border-[var(--color-brand)]' : 'border-[var(--color-border)]'
          } disabled:opacity-50`}
        />
      ))}
    </div>
  )
}

function usePinState() {
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''))
  const refs = useRef<(HTMLInputElement | null)[]>([])

  function handleChange(i: number, v: string) {
    const next = [...digits]
    next[i] = v
    setDigits(next)
    if (v && i < PIN_LENGTH - 1) refs.current[i + 1]?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent, i: number) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
  }

  function reset() {
    setDigits(Array(PIN_LENGTH).fill(''))
    setTimeout(() => refs.current[0]?.focus(), 50)
  }

  return { digits, refs, handleChange, handleKeyDown, reset, pin: digits.join('') }
}

// ── Create operator form ──────────────────────────────────────────────────────

function CreateOperatorForm({ onDone }: { onDone: () => void }) {
  const createOperator = useAppStore(s => s.createOperator)
  const [name, setName] = useState('')
  const pinA = usePinState()
  const pinB = usePinState()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setError('')
    if (!name.trim()) { setError('Name is required'); return }
    if (pinA.pin.length < PIN_LENGTH) { setError('Enter a 4-digit PIN'); return }
    if (pinA.pin !== pinB.pin) { setError('PINs do not match'); pinB.reset(); return }
    if (OBVIOUS_PINS.has(pinA.pin)) { setError('PIN is too obvious — choose a less predictable one'); pinA.reset(); pinB.reset(); return }
    setSaving(true)
    try {
      await createOperator(name.trim(), pinA.pin)
      onDone()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create operator')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card padding="lg" className="mb-6">
      <h3 className="text-[14px] font-bold text-slate-800 mb-4">New Operator</h3>

      <div className="flex flex-col gap-4">
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Sarah"
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[14px] outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">PIN (4 digits)</label>
          <PinInputs digits={pinA.digits} refs={pinA.refs} onChange={pinA.handleChange} onKeyDown={pinA.handleKeyDown} disabled={saving} />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Confirm PIN</label>
          <PinInputs digits={pinB.digits} refs={pinB.refs} onChange={pinB.handleChange} onKeyDown={pinB.handleKeyDown} disabled={saving} />
        </div>

        {error && <p className="text-[12px] text-[var(--color-danger)]">{error}</p>}

        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Creating…' : 'Create Operator'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        </div>
      </div>
    </Card>
  )
}

// ── Reset PIN form ────────────────────────────────────────────────────────────

function ResetPinForm({ operatorId, operatorName, onDone }: { operatorId: string; operatorName: string; onDone: () => void }) {
  const resetOperatorPin = useAppStore(s => s.resetOperatorPin)
  const pinA = usePinState()
  const pinB = usePinState()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSave() {
    setError('')
    if (pinA.pin.length < PIN_LENGTH) { setError('Enter a 4-digit PIN'); return }
    if (pinA.pin !== pinB.pin) { setError('PINs do not match'); pinB.reset(); return }
    if (OBVIOUS_PINS.has(pinA.pin)) { setError('PIN is too obvious'); pinA.reset(); pinB.reset(); return }
    setSaving(true)
    try {
      await resetOperatorPin(operatorId, pinA.pin)
      setDone(true)
      setTimeout(onDone, 1200)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to reset PIN')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 text-[var(--color-success)] text-[13px] py-2">
        <Check size={16} /> PIN updated for {operatorName}
      </div>
    )
  }

  return (
    <div className="mt-3 p-3 bg-slate-50 border border-[var(--color-border)] rounded-[var(--radius-md)] flex flex-col gap-3">
      <p className="text-[12px] text-slate-600">Set new PIN for <strong>{operatorName}</strong></p>
      <div className="flex gap-4 flex-wrap">
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">New PIN</label>
          <PinInputs digits={pinA.digits} refs={pinA.refs} onChange={pinA.handleChange} onKeyDown={pinA.handleKeyDown} disabled={saving} />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Confirm</label>
          <PinInputs digits={pinB.digits} refs={pinB.refs} onChange={pinB.handleChange} onKeyDown={pinB.handleKeyDown} disabled={saving} />
        </div>
      </div>
      {error && <p className="text-[12px] text-[var(--color-danger)]">{error}</p>}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save PIN'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function OperatorsView() {
  const operators = useAppStore(s => s.operators)
  const setOperatorActive = useAppStore(s => s.setOperatorActive)
  const [showCreate, setShowCreate] = useState(false)
  const [resetingId, setResetingId] = useState<string | null>(null)

  const active = operators.filter(o => o.isActive)
  const inactive = operators.filter(o => !o.isActive)

  return (
    <div className="p-8 max-w-[680px]">
      <div className="flex items-center justify-between mb-1.5">
        <h2 className="text-[18px] font-bold text-neutral-900">Operators</h2>
        {!showCreate && (
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={13} className="mr-1" /> Add Operator
          </Button>
        )}
      </div>
      <p className="text-[12px] text-neutral-400 mb-6">
        Operators authenticate with a 4-digit PIN on the scan screen. Only admins can create or reset PINs.
      </p>

      {showCreate && (
        <CreateOperatorForm onDone={() => setShowCreate(false)} />
      )}

      {operators.length === 0 && !showCreate ? (
        <div className="text-center py-12">
          <UserCircle size={40} weight="duotone" className="mx-auto mb-2.5 text-neutral-300" />
          <p className="text-[14px] text-neutral-400">No operators yet</p>
          <p className="text-[12px] text-neutral-300 mt-1">Add operators so your team can authenticate on the scan screen.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="mb-6">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Active ({active.length})</p>
              {active.map(op => (
                <div key={op.id} className="bg-white border border-[var(--color-border)] rounded-[var(--radius-lg)] px-4 py-3 mb-2">
                  <div className="flex items-center gap-3">
                    <UserCircle size={20} className="text-slate-400 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-[14px] font-semibold text-neutral-700">{op.name}</div>
                      <div className="text-[11px] text-neutral-400">Added {new Date(op.createdAt).toLocaleDateString('en-ZA')}</div>
                    </div>
                    <Button
                      variant="secondary" size="sm"
                      onClick={() => setResetingId(resetingId === op.id ? null : op.id)}
                    >
                      <Key size={12} className="mr-1" /> Reset PIN
                    </Button>
                    <Button
                      variant="secondary" size="sm"
                      className="text-[var(--color-warning)] border-[var(--color-warning)]/30 hover:bg-[var(--color-warning)]/10"
                      onClick={() => setOperatorActive(op.id, false)}
                    >
                      <Prohibit size={12} className="mr-1" /> Deactivate
                    </Button>
                  </div>
                  {resetingId === op.id && (
                    <ResetPinForm operatorId={op.id} operatorName={op.name} onDone={() => setResetingId(null)} />
                  )}
                </div>
              ))}
            </div>
          )}

          {inactive.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Inactive ({inactive.length})</p>
              {inactive.map(op => (
                <div key={op.id} className="bg-slate-50 border border-[var(--color-border)] rounded-[var(--radius-lg)] px-4 py-3 mb-2 flex items-center gap-3 opacity-60">
                  <UserCircle size={20} className="text-slate-300 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-[14px] font-semibold text-slate-500">{op.name}</div>
                    <div className="text-[11px] text-slate-400">Deactivated</div>
                  </div>
                  <Button
                    variant="secondary" size="sm"
                    className="text-[var(--color-success)] border-[var(--color-success)]/30 hover:bg-[var(--color-success)]/10"
                    onClick={() => setOperatorActive(op.id, true)}
                  >
                    Reactivate
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
