// StockShot — Admin: Settings

import { useState, useEffect } from 'react'
import useAppStore from '../../store/useAppStore'
import { supabase } from '../../lib/supabase'

const OBVIOUS_PINS = new Set(['000000','111111','222222','333333','444444','555555','666666','777777','888888','999999','123456','654321','121212','112233'])

function PinDigits({ digits, refs, onChange, onKeyDown, disabled }: {
  digits: string[]
  refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  onChange: (i: number, v: string) => void
  onKeyDown: (e: React.KeyboardEvent, i: number) => void
  disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: '8px', margin: '6px 0' }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          type="password" inputMode="numeric" maxLength={1}
          value={d}
          onChange={e => onChange(i, e.target.value.replace(/\D/g, '').slice(-1))}
          onKeyDown={e => onKeyDown(e, i)}
          disabled={disabled}
          style={{
            width: '38px', height: '44px', textAlign: 'center',
            fontSize: '18px', fontWeight: 700, caretColor: 'transparent',
            border: `2px solid ${d ? '#1C1C1E' : '#E0E0E0'}`, borderRadius: '8px', outline: 'none',
            background: disabled ? '#F5F5F5' : '#fff',
          }}
        />
      ))}
    </div>
  )
}

export default function AdminSettingsView() {
  const verifyPin = useAppStore(s => s.verifyPin)
  const setupInitialPin = useAppStore(s => s.setupInitialPin)
  const orgId = useAppStore(s => s.orgId)

  // Org name
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

  // Change PIN flow state
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
    <div style={{ padding: '2rem', maxWidth: '560px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111', marginBottom: '2rem' }}>Settings</h2>

      {/* Organisation */}
      <section style={card}>
        <h3 style={sectionHead}>Organisation</h3>
        <label style={labelStyle}>Org name</label>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            value={orgName}
            onChange={e => setOrgName(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={saveOrgName}
            disabled={orgLoading || !orgName.trim()}
            style={{ ...primaryBtn, opacity: orgName.trim() ? 1 : 0.4 }}
          >
            {orgSaved ? '✓ Saved' : orgLoading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      {/* Admin PIN */}
      <section style={card}>
        <h3 style={sectionHead}>Admin PIN</h3>

        {pinStep === 'idle' && (
          <>
            {pinDone && (
              <p style={{ fontSize: '13px', color: '#2E7D32', marginBottom: '12px', fontWeight: 600 }}>✓ PIN updated</p>
            )}
            <button onClick={() => { setPinStep('verify-current'); setPinError(null) }} style={primaryBtn}>
              Change PIN
            </button>
          </>
        )}

        {pinStep === 'verify-current' && (
          <>
            <p style={{ fontSize: '13px', color: '#555', marginBottom: '12px' }}>Enter your current PIN to continue.</p>
            <label style={labelStyle}>Current PIN</label>
            <PinDigits digits={curPin} refs={curRefs} onChange={(i, v) => handleDigit(i, v, curPin, setCurPin, curRefs)} onKeyDown={(e, i) => handleKeyDown(e, i, curPin, setCurPin, curRefs)} disabled={pinLoading} />
            {pinError && <p style={errorStyle}>{pinError}</p>}
            <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
              <button onClick={verifyCurrentPin} disabled={pinLoading || curPin.join('').length !== 6} style={{ ...primaryBtn, opacity: curPin.join('').length === 6 ? 1 : 0.4 }}>
                {pinLoading ? 'Checking…' : 'Next'}
              </button>
              <button onClick={cancelPinChange} style={ghostBtn}>Cancel</button>
            </div>
          </>
        )}

        {pinStep === 'set-new' && (
          <>
            <p style={{ fontSize: '13px', color: '#555', marginBottom: '12px' }}>Choose your new PIN.</p>
            <label style={labelStyle}>New PIN</label>
            <PinDigits digits={newPin} refs={newRefs} onChange={(i, v) => handleDigit(i, v, newPin, setNewPin, newRefs, newConfirmRefs)} onKeyDown={(e, i) => handleKeyDown(e, i, newPin, setNewPin, newRefs)} disabled={pinLoading} />
            <label style={{ ...labelStyle, marginTop: '12px' }}>Confirm new PIN</label>
            <PinDigits digits={newPinConfirm} refs={newConfirmRefs} onChange={(i, v) => handleDigit(i, v, newPinConfirm, setNewPinConfirm, newConfirmRefs)} onKeyDown={(e, i) => handleKeyDown(e, i, newPinConfirm, setNewPinConfirm, newConfirmRefs)} disabled={pinLoading} />
            {pinError && <p style={errorStyle}>{pinError}</p>}
            <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
              <button onClick={applyNewPin} disabled={pinLoading || newPin.join('').length !== 6 || newPinConfirm.join('').length !== 6} style={{ ...primaryBtn, opacity: newPin.join('').length === 6 && newPinConfirm.join('').length === 6 ? 1 : 0.4 }}>
                {pinLoading ? 'Saving…' : 'Save PIN'}
              </button>
              <button onClick={cancelPinChange} style={ghostBtn}>Cancel</button>
            </div>
          </>
        )}
      </section>

      {/* Account */}
      <section style={card}>
        <h3 style={sectionHead}>Account</h3>
        <button onClick={() => supabase.auth.signOut()} style={ghostBtn}>Sign out</button>
      </section>
    </div>
  )
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E0E0E0', borderRadius: '12px', padding: '20px', marginBottom: '1.5rem' }
const sectionHead: React.CSSProperties = { fontSize: '14px', fontWeight: 700, color: '#111', marginBottom: '14px' }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: '#666', marginBottom: '4px' }
const inputStyle: React.CSSProperties = { padding: '8px 10px', fontSize: '13px', border: '1px solid #E0E0E0', borderRadius: '6px', outline: 'none' }
const primaryBtn: React.CSSProperties = { padding: '9px 20px', background: '#1C1C1E', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }
const ghostBtn: React.CSSProperties = { padding: '9px 16px', background: 'transparent', border: '1px solid #E0E0E0', borderRadius: '8px', fontSize: '13px', color: '#555', cursor: 'pointer' }
const errorStyle: React.CSSProperties = { fontSize: '12px', color: '#B71C1C', marginTop: '6px' }
