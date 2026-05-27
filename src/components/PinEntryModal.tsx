// StockShot — PIN Entry Modal (verify / setup / forgot-PIN flows)

import { useState, useRef, useEffect, useCallback } from 'react'
import useAppStore from '../store/useAppStore'
import { supabase } from '../lib/supabase'

type Mode = 'verify' | 'setup' | 'forgot'

const OBVIOUS_PINS = new Set(['000000','111111','222222','333333','444444','555555','666666','777777','888888','999999','123456','654321','121212','112233'])

interface Props {
  mode: 'verify' | 'setup'
  onSuccess: () => void
  onCancel: () => void
}

export default function PinEntryModal({ mode: initialMode, onSuccess, onCancel }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [pin, setPin] = useState(['', '', '', '', '', ''])
  const [confirm, setConfirm] = useState(['', '', '', '', '', ''])
  const [password, setPassword] = useState('')
  const [newPin, setNewPin] = useState(['', '', '', '', '', ''])
  const [newPinConfirm, setNewPinConfirm] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null)
  const [, tick] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const confirmRefs = useRef<(HTMLInputElement | null)[]>([])
  const newPinRefs = useRef<(HTMLInputElement | null)[]>([])
  const newPinConfirmRefs = useRef<(HTMLInputElement | null)[]>([])

  const verifyPin = useAppStore(s => s.verifyPin)
  const setupInitialPin = useAppStore(s => s.setupInitialPin)
  const resetPinViaPassword = useAppStore(s => s.resetPinViaPassword)
  const adminPinAttemptsThisSession = useAppStore(s => s.adminPinAttemptsThisSession)

  // Countdown ticker while locked
  useEffect(() => {
    if (!lockedUntil) return
    const id = setInterval(() => {
      tick(n => n + 1)
      if (lockedUntil <= new Date()) setLockedUntil(null)
    }, 1000)
    return () => clearInterval(id)
  }, [lockedUntil])

  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [mode])

  function triggerShake(msg: string) {
    setError(msg)
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  function handlePinDigit(
    idx: number,
    val: string,
    arr: string[],
    setArr: (a: string[]) => void,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>,
    nextFocusRefs?: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...arr]
    next[idx] = digit
    setArr(next)
    if (digit && idx < 5) refs.current[idx + 1]?.focus()
    if (digit && idx === 5 && nextFocusRefs) nextFocusRefs.current[0]?.focus()
  }

  function handlePinKeyDown(
    e: React.KeyboardEvent,
    idx: number,
    arr: string[],
    setArr: (a: string[]) => void,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) {
    if (e.key === 'Backspace' && !arr[idx] && idx > 0) {
      const next = [...arr]
      next[idx - 1] = ''
      setArr(next)
      refs.current[idx - 1]?.focus()
    }
  }

  const pinValue = pin.join('')
  const confirmValue = confirm.join('')
  const newPinValue = newPin.join('')
  const newPinConfirmValue = newPinConfirm.join('')

  function validateNewPin(p: string): string | null {
    if (p.length !== 6) return 'PIN must be 6 digits'
    if (OBVIOUS_PINS.has(p)) return 'PIN is too simple — choose something less predictable'
    return null
  }

  const handleVerify = useCallback(async () => {
    if (pinValue.length !== 6) return
    if (lockedUntil && lockedUntil > new Date()) return
    setLoading(true)
    setError(null)
    const result = await verifyPin(pinValue)
    setLoading(false)
    if (result.ok) {
      onSuccess()
    } else if (result.lockedUntil) {
      setLockedUntil(result.lockedUntil)
      setPin(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } else {
      setPin(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
      if (adminPinAttemptsThisSession + 1 >= 10) {
        triggerShake('Too many attempts. Use "Forgot PIN?" to reset.')
      } else {
        triggerShake('Incorrect PIN')
      }
    }
  }, [pinValue, lockedUntil, verifyPin, onSuccess, adminPinAttemptsThisSession])

  // Auto-submit on last digit in verify mode
  useEffect(() => {
    if (mode === 'verify' && pinValue.length === 6) handleVerify()
  }, [pinValue, mode, handleVerify])

  async function handleSetup() {
    const err = validateNewPin(pinValue)
    if (err) { triggerShake(err); return }
    if (pinValue !== confirmValue) { triggerShake('PINs do not match'); return }
    setLoading(true)
    try {
      await setupInitialPin(pinValue)
      onSuccess()
    } catch (e: any) {
      triggerShake(e.message ?? 'Failed to set PIN')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot() {
    const err = validateNewPin(newPinValue)
    if (err) { triggerShake(err); return }
    if (newPinValue !== newPinConfirmValue) { triggerShake('PINs do not match'); return }
    if (!password) { triggerShake('Enter your account password'); return }
    setLoading(true)
    setError(null)
    try {
      await resetPinViaPassword(password, newPinValue)
      onSuccess()
    } catch (e: any) {
      triggerShake(e.message ?? 'Reset failed')
    } finally {
      setLoading(false)
    }
  }

  // Check if user has Google OAuth (no password available)
  const [isOAuthUser, setIsOAuthUser] = useState(false)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const identities = data.user?.identities ?? []
      setIsOAuthUser(identities.every(i => i.provider !== 'email'))
    })
  }, [])

  const lockoutSecs = lockedUntil ? Math.ceil((lockedUntil.getTime() - Date.now()) / 1000) : 0

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: '14px', padding: '28px 32px',
        width: '340px', boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        animation: shake ? 'shake 0.4s ease' : undefined,
      }}>
        <style>{`
          @keyframes shake {
            0%,100% { transform: translateX(0) }
            20%      { transform: translateX(-8px) }
            40%      { transform: translateX(8px) }
            60%      { transform: translateX(-6px) }
            80%      { transform: translateX(6px) }
          }
        `}</style>

        {/* ── Verify mode ──────────────────────────────────── */}
        {mode === 'verify' && (
          <>
            <h2 style={heading}>Admin access</h2>
            <p style={sub}>Enter your 6-digit PIN</p>
            <PinRow digits={pin} refs={inputRefs} onChange={(i, v) => handlePinDigit(i, v, pin, setPin, inputRefs)} onKeyDown={(e, i) => handlePinKeyDown(e, i, pin, setPin, inputRefs)} disabled={loading || (lockedUntil !== null && lockedUntil > new Date())} />
            {lockedUntil && lockedUntil > new Date() ? (
              <p style={errorStyle}>Locked — try again in {lockoutSecs}s</p>
            ) : error ? (
              <p style={errorStyle}>{error}</p>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', alignItems: 'center' }}>
              <button onClick={() => { setMode('forgot'); setError(null) }} style={linkBtn}>Forgot PIN?</button>
              <button onClick={onCancel} style={ghostBtn}>Cancel</button>
            </div>
          </>
        )}

        {/* ── Setup mode ───────────────────────────────────── */}
        {mode === 'setup' && (
          <>
            <h2 style={heading}>Set up admin PIN</h2>
            <p style={sub}>Choose a 6-digit PIN to protect admin actions.</p>
            <label style={fieldLabel}>PIN</label>
            <PinRow digits={pin} refs={inputRefs} onChange={(i, v) => handlePinDigit(i, v, pin, setPin, inputRefs, confirmRefs)} onKeyDown={(e, i) => handlePinKeyDown(e, i, pin, setPin, inputRefs)} disabled={loading} />
            <label style={{ ...fieldLabel, marginTop: '14px' }}>Confirm PIN</label>
            <PinRow digits={confirm} refs={confirmRefs} onChange={(i, v) => handlePinDigit(i, v, confirm, setConfirm, confirmRefs)} onKeyDown={(e, i) => handlePinKeyDown(e, i, confirm, setConfirm, confirmRefs)} disabled={loading} />
            {error && <p style={errorStyle}>{error}</p>}
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={handleSetup} disabled={loading || pinValue.length !== 6 || confirmValue.length !== 6} style={{ ...primaryBtn, opacity: pinValue.length === 6 && confirmValue.length === 6 ? 1 : 0.4 }}>
                {loading ? 'Saving…' : 'Set PIN'}
              </button>
              <button onClick={onCancel} style={ghostBtn}>Cancel</button>
            </div>
          </>
        )}

        {/* ── Forgot PIN mode ──────────────────────────────── */}
        {mode === 'forgot' && (
          <>
            <h2 style={heading}>Reset PIN</h2>
            {isOAuthUser ? (
              <>
                <p style={sub}>Your account uses Google sign-in and has no password. Contact support to reset your PIN.</p>
                <button onClick={() => setMode('verify')} style={{ ...ghostBtn, marginTop: '16px' }}>Back</button>
              </>
            ) : (
              <>
                <p style={sub}>Enter your account password to set a new PIN.</p>
                <label style={fieldLabel}>Account password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ ...textInput, width: '100%', boxSizing: 'border-box', marginBottom: '14px' }}
                />
                <label style={fieldLabel}>New PIN</label>
                <PinRow digits={newPin} refs={newPinRefs} onChange={(i, v) => handlePinDigit(i, v, newPin, setNewPin, newPinRefs, newPinConfirmRefs)} onKeyDown={(e, i) => handlePinKeyDown(e, i, newPin, setNewPin, newPinRefs)} disabled={loading} />
                <label style={{ ...fieldLabel, marginTop: '14px' }}>Confirm new PIN</label>
                <PinRow digits={newPinConfirm} refs={newPinConfirmRefs} onChange={(i, v) => handlePinDigit(i, v, newPinConfirm, setNewPinConfirm, newPinConfirmRefs)} onKeyDown={(e, i) => handlePinKeyDown(e, i, newPinConfirm, setNewPinConfirm, newPinConfirmRefs)} disabled={loading} />
                {error && <p style={errorStyle}>{error}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button onClick={handleForgot} disabled={loading || !password || newPinValue.length !== 6 || newPinConfirmValue.length !== 6} style={{ ...primaryBtn, opacity: password && newPinValue.length === 6 && newPinConfirmValue.length === 6 ? 1 : 0.4 }}>
                    {loading ? 'Resetting…' : 'Reset PIN'}
                  </button>
                  <button onClick={() => { setMode('verify'); setError(null) }} style={ghostBtn}>Back</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function PinRow({ digits, refs, onChange, onKeyDown, disabled }: {
  digits: string[]
  refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  onChange: (i: number, v: string) => void
  onKeyDown: (e: React.KeyboardEvent, i: number) => void
  disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', margin: '8px 0' }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={e => onChange(i, e.target.value)}
          onKeyDown={e => onKeyDown(e, i)}
          disabled={disabled}
          style={{
            width: '40px', height: '48px', textAlign: 'center',
            fontSize: '20px', fontWeight: 700,
            border: `2px solid ${d ? '#1C1C1E' : '#E0E0E0'}`,
            borderRadius: '8px', outline: 'none',
            background: disabled ? '#F5F5F5' : '#fff',
            caretColor: 'transparent',
          }}
        />
      ))}
    </div>
  )
}

const heading: React.CSSProperties = { fontSize: '18px', fontWeight: 700, color: '#111', marginBottom: '6px' }
const sub: React.CSSProperties = { fontSize: '13px', color: '#666', marginBottom: '16px' }
const errorStyle: React.CSSProperties = { fontSize: '12px', color: '#B71C1C', textAlign: 'center', marginTop: '8px' }
const fieldLabel: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: '#666', marginBottom: '4px' }
const textInput: React.CSSProperties = { padding: '8px 10px', fontSize: '13px', border: '1px solid #E0E0E0', borderRadius: '6px', outline: 'none' }
const primaryBtn: React.CSSProperties = { padding: '9px 20px', background: '#1C1C1E', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }
const ghostBtn: React.CSSProperties = { padding: '9px 16px', background: 'transparent', border: '1px solid #E0E0E0', borderRadius: '8px', fontSize: '13px', color: '#555', cursor: 'pointer' }
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', fontSize: '12px', color: '#1565C0', cursor: 'pointer', padding: 0 }
