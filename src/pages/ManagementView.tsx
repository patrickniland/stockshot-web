// StockShot — Management View

import { useState } from 'react'
import useAppStore from '../store/useAppStore'
import { CustodyLocation } from '../types'

const LOCATIONS: { value: CustodyLocation; label: string; icon: string; color: string }[] = [
  { value: 'with_client',         label: 'With Client',    icon: '📦', color: '#E65100' },
  { value: 'in_transit',          label: 'In Transit',     icon: '🚚', color: '#1565C0' },
  { value: 'at_studio',           label: 'At Studio',      icon: '🏠', color: '#2E7D32' },
  { value: 'dispatched_to_client',label: 'Dispatched',     icon: '✅', color: '#6A1B9A' },
]

export default function ManagementView() {
  const savedShoots    = useAppStore(s => s.savedShoots)
  const managerPin     = useAppStore(s => s.managerPin)
  const setManagerPin  = useAppStore(s => s.setManagerPin)
  const bulkSetCustody = useAppStore(s => s.bulkSetCustody)
  const currentOperator = useAppStore(s => s.currentOperator)

  // PIN config state
  const [pinInput, setPinInput]     = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinSaved, setPinSaved]     = useState(false)

  // Batch move state
  const [fromLoc, setFromLoc]         = useState<CustodyLocation>('at_studio')
  const [toLoc, setToLoc]             = useState<CustodyLocation>('dispatched_to_client')
  const [shootFilter, setShootFilter] = useState<string>('all')
  const [enteredPin, setEnteredPin]   = useState('')
  const [result, setResult]           = useState<{ count: number; ok: boolean } | null>(null)
  const [operator, setOperator]       = useState(currentOperator)

  const activeShoots = savedShoots.filter(s => !s.deletedAt)

  // Count items per location (scanned items only)
  const allItems = (shootFilter === 'all'
    ? activeShoots.flatMap(s => s.items)
    : (activeShoots.find(s => s.id === shootFilter)?.items ?? [])
  ).filter(i => (i.custodyHistory ?? []).length > 0)

  const countFor = (loc: CustodyLocation) => allItems.filter(i => i.custodyLocation === loc).length

  function savePin() {
    if (pinInput.length < 4) return
    if (pinInput !== pinConfirm) return
    setManagerPin(pinInput)
    setPinInput('')
    setPinConfirm('')
    setPinSaved(true)
    setTimeout(() => setPinSaved(false), 2000)
  }

  function clearPin() {
    setManagerPin('')
    setPinSaved(false)
  }

  function executeBatchMove() {
    if (fromLoc === toLoc) return
    if (managerPin && enteredPin !== managerPin) {
      setResult({ count: 0, ok: false })
      return
    }

    const sourceItems = allItems.filter(i => i.custodyLocation === fromLoc)
    if (sourceItems.length === 0) {
      setResult({ count: 0, ok: true })
      return
    }

    bulkSetCustody(sourceItems.map(i => i.id), toLoc, operator.trim() || 'Manager')
    setResult({ count: sourceItems.length, ok: true })
    setEnteredPin('')
  }

  const fromLabel = LOCATIONS.find(l => l.value === fromLoc)!
  const toLabel   = LOCATIONS.find(l => l.value === toLoc)!
  const matchCount = countFor(fromLoc)

  return (
    <div style={{ padding: '2rem', maxWidth: '600px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111', marginBottom: '6px' }}>Management</h2>
      <p style={{ fontSize: '12px', color: '#888', marginBottom: '2rem' }}>
        Manager-only tools. Set a PIN to require authorisation for bulk operations.
      </p>

      {/* ── PIN Configuration ─────────────────────────────── */}
      <section style={card}>
        <h3 style={sectionHead}>Manager PIN</h3>
        {managerPin ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <span style={{ fontSize: '13px', color: '#2E7D32', fontWeight: 600 }}>
              ✓ PIN set ({managerPin.length} digits)
            </span>
            <button onClick={clearPin} style={ghostBtn}>Remove PIN</button>
          </div>
        ) : (
          <p style={{ fontSize: '12px', color: '#888', marginBottom: '14px' }}>
            No PIN set — bulk moves require no authorisation.
          </p>
        )}

        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={fieldLabel}>New PIN (min 4 digits)</label>
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="••••"
              style={{ ...textInput, width: '100px' }}
            />
          </div>
          <div>
            <label style={fieldLabel}>Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={pinConfirm}
              onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="••••"
              style={{
                ...textInput,
                width: '100px',
                borderColor: pinConfirm && pinConfirm !== pinInput ? '#E53935' : undefined,
              }}
            />
          </div>
          <button
            onClick={savePin}
            disabled={pinInput.length < 4 || pinInput !== pinConfirm}
            style={{
              ...primaryBtn,
              opacity: (pinInput.length < 4 || pinInput !== pinConfirm) ? 0.4 : 1,
            }}
          >
            {pinSaved ? '✓ Saved' : 'Save PIN'}
          </button>
        </div>
        {pinConfirm && pinConfirm !== pinInput && (
          <p style={{ fontSize: '11px', color: '#E53935', marginTop: '6px' }}>PINs do not match.</p>
        )}
      </section>

      {/* ── Batch Move ────────────────────────────────────── */}
      <section style={card}>
        <h3 style={sectionHead}>Batch Move</h3>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
          Move all scanned items from one location to another in a single action.
        </p>

        {/* Shoot filter */}
        <div style={{ marginBottom: '16px' }}>
          <label style={fieldLabel}>Shoot (optional filter)</label>
          <select value={shootFilter} onChange={e => { setShootFilter(e.target.value); setResult(null) }}
            style={selectInput}>
            <option value="all">All shoots</option>
            {activeShoots.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* From → To pickers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>From</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {LOCATIONS.map(loc => (
                <button
                  key={loc.value}
                  onClick={() => { setFromLoc(loc.value); setResult(null) }}
                  style={{
                    ...locBtn,
                    borderColor: fromLoc === loc.value ? loc.color : '#E0E0E0',
                    background: fromLoc === loc.value ? loc.color + '18' : '#F9F9F9',
                    color: fromLoc === loc.value ? loc.color : '#555',
                    fontWeight: fromLoc === loc.value ? 700 : 400,
                  }}
                >
                  {loc.icon} {loc.label}
                  <span style={{ marginLeft: 'auto', fontSize: '11px', opacity: 0.7 }}>
                    {countFor(loc.value)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ fontSize: '22px', color: '#999', flexShrink: 0, paddingTop: '18px' }}>→</div>

          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>To</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {LOCATIONS.map(loc => (
                <button
                  key={loc.value}
                  disabled={loc.value === fromLoc}
                  onClick={() => { setToLoc(loc.value); setResult(null) }}
                  style={{
                    ...locBtn,
                    borderColor: toLoc === loc.value && loc.value !== fromLoc ? loc.color : '#E0E0E0',
                    background: toLoc === loc.value && loc.value !== fromLoc ? loc.color + '18' : '#F9F9F9',
                    color: loc.value === fromLoc ? '#ccc' : toLoc === loc.value ? loc.color : '#555',
                    fontWeight: toLoc === loc.value && loc.value !== fromLoc ? 700 : 400,
                    cursor: loc.value === fromLoc ? 'default' : 'pointer',
                  }}
                >
                  {loc.icon} {loc.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary line */}
        <div style={{ background: '#F5F5F5', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#333' }}>
          Move <strong>{matchCount}</strong> item{matchCount !== 1 ? 's' : ''} from{' '}
          <strong style={{ color: fromLabel.color }}>{fromLabel.icon} {fromLabel.label}</strong>
          {' → '}
          <strong style={{ color: toLabel.color }}>{toLabel.icon} {toLabel.label}</strong>
        </div>

        {/* Operator */}
        <div style={{ marginBottom: '12px' }}>
          <label style={fieldLabel}>Operator name</label>
          <input
            value={operator}
            onChange={e => setOperator(e.target.value)}
            placeholder="Your name..."
            style={{ ...textInput, width: '200px' }}
          />
        </div>

        {/* PIN entry (only if PIN is set) */}
        {managerPin && (
          <div style={{ marginBottom: '12px' }}>
            <label style={fieldLabel}>Manager PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={enteredPin}
              onChange={e => setEnteredPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter PIN to authorise"
              style={{
                ...textInput,
                width: '180px',
                borderColor: result && !result.ok ? '#E53935' : undefined,
              }}
            />
          </div>
        )}

        {/* Result feedback */}
        {result && (
          <div style={{
            padding: '10px 14px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px',
            background: result.ok ? '#E8F5E9' : '#FFEBEE',
            color: result.ok ? '#2E7D32' : '#B71C1C',
            fontWeight: 600,
          }}>
            {result.ok
              ? result.count > 0
                ? `✓ Moved ${result.count} item${result.count !== 1 ? 's' : ''} to ${toLabel.label}`
                : '✓ No items to move at that location'
              : '✗ Incorrect PIN'}
          </div>
        )}

        <button
          onClick={executeBatchMove}
          disabled={fromLoc === toLoc || matchCount === 0}
          style={{
            ...primaryBtn,
            background: fromLoc === toLoc || matchCount === 0 ? '#E0E0E0' : '#1C1C1E',
            color: fromLoc === toLoc || matchCount === 0 ? '#999' : '#fff',
            opacity: 1,
          }}
        >
          Move {matchCount} item{matchCount !== 1 ? 's' : ''}
        </button>
      </section>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E0E0E0',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '1.5rem',
}

const sectionHead: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 700,
  color: '#111',
  marginBottom: '14px',
}

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: '#666',
  marginBottom: '5px',
}

const textInput: React.CSSProperties = {
  padding: '7px 10px',
  fontSize: '13px',
  border: '1px solid #E0E0E0',
  borderRadius: '6px',
  outline: 'none',
  boxSizing: 'border-box',
}

const selectInput: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  fontSize: '13px',
  border: '1px solid #E0E0E0',
  borderRadius: '6px',
  background: '#fff',
  cursor: 'pointer',
}

const locBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '7px 12px',
  borderRadius: '7px',
  border: '1.5px solid',
  fontSize: '12px',
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
}

const primaryBtn: React.CSSProperties = {
  padding: '9px 20px',
  background: '#1C1C1E',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
}

const ghostBtn: React.CSSProperties = {
  padding: '5px 10px',
  background: 'transparent',
  border: '1px solid #E0E0E0',
  borderRadius: '6px',
  fontSize: '12px',
  color: '#666',
  cursor: 'pointer',
}
