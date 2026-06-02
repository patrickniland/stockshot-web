// StockShot — Admin: Settings

import { useState, useEffect } from 'react'
import useAppStore from '../../store/useAppStore'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'

const OBVIOUS_PINS = new Set(['000000','111111','222222','333333','444444','555555','666666','777777','888888','999999','123456','654321','121212','112233'])

function PinDigits({ digits, refs, onChange, onKeyDown, disabled }: {
  digits: string[]
  refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  onChange: (i: number, v: string) => void
  onKeyDown: (e: React.KeyboardEvent, i: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex gap-2 my-1.5">
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
          } ${disabled ? 'bg-[var(--color-surface-muted)]' : 'bg-white'}`}
        />
      ))}
    </div>
  )
}

export default function AdminSettingsView() {
  const verifyPin = useAppStore(s => s.verifyPin)
  const setupInitialPin = useAppStore(s => s.setupInitialPin)
  const orgId = useAppStore(s => s.orgId)

  const [orgName, setOrgName] = useState('')
  const [orgSaved, setOrgSaved] = useState(false)
  const [orgLoading, setOrgLoading] = useState(false)

  useEffect(() => {
    if (!orgId) return
    supabase.from('organisations').select('name').eq('id', orgId).single()
      .then(({ data }) => { if (data) setOrgName(data.name) })
  }, [orgId])

  async function saveOrgName() {
    if (!orgId || !orgName.trim()) return
    setOrgLoading(true)
    await supabase.from('organisations').update({ name: orgName.trim() }).eq('id', orgId)
    setOrgLoading(false)
    setOrgSaved(true)
    setTimeout(() => setOrgSaved(false), 2000)
  }

  const [pinStep, setPinStep] = useState<'idle' | 'verify-current' | 'set-new'>('idle')
  const [curPin, setCurPin] = useState(['', '', '', '', '', ''])
  const [newPin, setNewPin] = useState(['', '', '', '', '', ''])
  const [newPinConfirm, setNewPinConfirm] = useState(['', '', '', '', '', ''])
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinLoading, setPinLoading] = useState(false)
  const [pinDone, setPinDone] = useState(false)

  const curRefs = { current: [] as (HTMLInputElement | null)[] }
  const newRefs = { current: [] as (HTMLInputElement | null)[] }
  const newConfirmRefs = { current: [] as (HTMLInputElement | null)[] }

  function handleDigit(idx: number, val: string, arr: string[], setArr: (a: string[]) => void, refs: typeof curRefs, nextRefs?: typeof curRefs) {
    const next = [...arr]; next[idx] = val
    setArr(next)
    if (val && idx < 5) refs.current[idx + 1]?.focus()
    if (val && idx === 5 && nextRefs) nextRefs.current[0]?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent, idx: number, arr: string[], setArr: (a: string[]) => void, refs: typeof curRefs) {
    if (e.key === 'Backspace' && !arr[idx] && idx > 0) {
      const next = [...arr]; next[idx - 1] = ''
      setArr(next); refs.current[idx - 1]?.focus()
    }
  }

  async function verifyCurrentPin() {
    const p = curPin.join('')
    if (p.length !== 6) return
    setPinLoading(true); setPinError(null)
    const result = await verifyPin(p)
    setPinLoading(false)
    if (result.ok) {
      setPinStep('set-new')
      setCurPin(['', '', '', '', '', ''])
    } else {
      setPinError('Incorrect PIN')
      setCurPin(['', '', '', '', '', ''])
    }
  }

  async function applyNewPin() {
    const p = newPin.join('')
    const c = newPinConfirm.join('')
    if (p !== c) { setPinError('PINs do not match'); return }
    if (OBVIOUS_PINS.has(p)) { setPinError('PIN is too simple'); return }
    setPinLoading(true); setPinError(null)
    try {
      await setupInitialPin(p)
      setPinDone(true)
      setPinStep('idle')
      setNewPin(['', '', '', '', '', ''])
      setNewPinConfirm(['', '', '', '', '', ''])
      setTimeout(() => setPinDone(false), 3000)
    } catch (e: any) {
      setPinError(e.message)
    } finally {
      setPinLoading(false)
    }
  }

  function cancelPinChange() {
    setPinStep('idle'); setPinError(null)
    setCurPin(['', '', '', '', '', ''])
    setNewPin(['', '', '', '', '', ''])
    setNewPinConfirm(['', '', '', '', '', ''])
  }

  return (
    <div className="p-8 max-w-[560px]">
      <h2 className="text-[18px] font-bold text-neutral-900 mb-8">Settings</h2>

      {/* Organisation */}
      <Card padding="md" className="mb-6">
        <h3 className="text-[14px] font-bold text-neutral-900 mb-3.5">Organisation</h3>
        <label className="block text-[11px] font-semibold text-neutral-500 mb-1">Org name</label>
        <div className="flex gap-2.5 items-center">
          <input
            value={orgName}
            onChange={e => setOrgName(e.target.value)}
            className="flex-1 px-2.5 py-2 text-[13px] border border-[var(--color-border)] rounded-md outline-none"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={saveOrgName}
            disabled={orgLoading || !orgName.trim()}
          >
            {orgSaved ? 'Saved' : orgLoading ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </Card>

      {/* Admin PIN */}
      <Card padding="md" className="mb-6">
        <h3 className="text-[14px] font-bold text-neutral-900 mb-3.5">Admin PIN</h3>

        {pinStep === 'idle' && (
          <>
            {pinDone && (
              <p className="text-[13px] text-[var(--color-success)] mb-3 font-semibold">PIN updated</p>
            )}
            <Button variant="primary" size="sm" onClick={() => { setPinStep('verify-current'); setPinError(null) }}>
              Change PIN
            </Button>
          </>
        )}

        {pinStep === 'verify-current' && (
          <>
            <p className="text-[13px] text-neutral-600 mb-3">Enter your current PIN to continue.</p>
            <label className="block text-[11px] font-semibold text-neutral-500 mb-1">Current PIN</label>
            <PinDigits digits={curPin} refs={curRefs} onChange={(i, v) => handleDigit(i, v, curPin, setCurPin, curRefs)} onKeyDown={(e, i) => handleKeyDown(e, i, curPin, setCurPin, curRefs)} disabled={pinLoading} />
            {pinError && <p className="text-[12px] text-[var(--color-danger)] mt-1.5">{pinError}</p>}
            <div className="flex gap-2.5 mt-3.5">
              <Button variant="primary" size="sm" onClick={verifyCurrentPin} disabled={pinLoading || curPin.join('').length !== 6}>
                {pinLoading ? 'Checking...' : 'Next'}
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelPinChange}>Cancel</Button>
            </div>
          </>
        )}

        {pinStep === 'set-new' && (
          <>
            <p className="text-[13px] text-neutral-600 mb-3">Choose your new PIN.</p>
            <label className="block text-[11px] font-semibold text-neutral-500 mb-1">New PIN</label>
            <PinDigits digits={newPin} refs={newRefs} onChange={(i, v) => handleDigit(i, v, newPin, setNewPin, newRefs, newConfirmRefs)} onKeyDown={(e, i) => handleKeyDown(e, i, newPin, setNewPin, newRefs)} disabled={pinLoading} />
            <label className="block text-[11px] font-semibold text-neutral-500 mb-1 mt-3">Confirm new PIN</label>
            <PinDigits digits={newPinConfirm} refs={newConfirmRefs} onChange={(i, v) => handleDigit(i, v, newPinConfirm, setNewPinConfirm, newConfirmRefs)} onKeyDown={(e, i) => handleKeyDown(e, i, newPinConfirm, setNewPinConfirm, newConfirmRefs)} disabled={pinLoading} />
            {pinError && <p className="text-[12px] text-[var(--color-danger)] mt-1.5">{pinError}</p>}
            <div className="flex gap-2.5 mt-3.5">
              <Button variant="primary" size="sm" onClick={applyNewPin} disabled={pinLoading || newPin.join('').length !== 6 || newPinConfirm.join('').length !== 6}>
                {pinLoading ? 'Saving...' : 'Save PIN'}
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelPinChange}>Cancel</Button>
            </div>
          </>
        )}
      </Card>

      {/* Account */}
      <Card padding="md">
        <h3 className="text-[14px] font-bold text-neutral-900 mb-3.5">Account</h3>
        <Button variant="secondary" size="sm" onClick={() => supabase.auth.signOut()}>Sign out</Button>
      </Card>
    </div>
  )
}
