// StockShot — Scan Out View

import { useState, useRef, useEffect } from 'react'
import useAppStore from '../store/useAppStore'
import { StockItem, CustodyLocation, CustodyEvent } from '../types'
import CameraScanner from '../components/CameraScanner'
import ShootPicker from '../components/ShootPicker'

// ── Types ─────────────────────────────────────────────────────────────────────

type OutToKey = 'in_transit_studio' | 'dispatched_to_client'

const OUT_TO_OPTIONS: { key: OutToKey; label: string; location: CustodyLocation; notes: string }[] = [
  { key: 'in_transit_studio',    label: 'In Transit (to Studio)',  location: 'in_transit',           notes: 'In transit to studio' },
  { key: 'dispatched_to_client', label: 'Dispatched to Client',    location: 'dispatched_to_client', notes: '' },
]

type RecentScan = {
  key: string
  itemId: string
  identifier: string
  description: string
  outToLabel: string
  location: CustodyLocation
  time: string
  prev: Pick<StockItem, 'custodyLocation' | 'custodyHistory' | 'lastScannedAt' | 'lastScannedBy'>
}

const LOCATION_ICON: Record<CustodyLocation, string> = {
  with_client: '📦',
  in_transit: '🚚',
  at_studio: '🏠',
  dispatched_to_client: '✅',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseScan(raw: string): string {
  const t = raw.trim()
  const parts = t.split('-')
  if (parts.length === 3 && parts.every(p => /^\d+$/.test(p))) return parts[1]
  if (/^\d+$/.test(t) && t.length >= 4) return t.slice(2, -1)
  return t
}

function matchesBarcode(item: StockItem, raw: string): boolean {
  const norm = normaliseScan(raw).toLowerCase()
  const rawL = raw.toLowerCase()
  const extras = Object.values(item.extraFields).map(v => v.toLowerCase())
  return (
    item.sku.toLowerCase() === rawL || item.sku.toLowerCase() === norm ||
    item.qrCodeValue.toLowerCase() === rawL || item.qrCodeValue.toLowerCase() === norm ||
    item.styleNumber.toLowerCase() === rawL || item.styleNumber.toLowerCase() === norm ||
    extras.some(v => v === rawL || v === norm)
  )
}

function locationLabel(loc: CustodyLocation): string {
  switch (loc) {
    case 'at_studio': return 'At Studio'
    case 'with_client': return 'With Client'
    case 'in_transit': return 'In Transit'
    case 'dispatched_to_client': return 'Dispatched'
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScanOutView() {
  const scanRef = useRef<HTMLInputElement>(null)
  const [scanInput, setScanInput] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const [outToKey, setOutToKey] = useState<OutToKey>('in_transit_studio')
  const [recentScans, setRecentScans] = useState<RecentScan[]>([])
  const [activeStatView, setActiveStatView] = useState<CustodyLocation>('at_studio')

  const savedShoots = useAppStore(s => s.savedShoots)
  const activeShootId = useAppStore(s => s.activeShootId)
  const currentOperator = useAppStore(s => s.currentOperator)
  const setCurrentOperator = useAppStore(s => s.setCurrentOperator)
  const setCustody = useAppStore(s => s.setCustody)
  const restoreItemState = useAppStore(s => s.restoreItemState)
  const setLastScanFeedback = useAppStore(s => s.setLastScanFeedback)
  const lastScanFeedback = useAppStore(s => s.lastScanFeedback)

  const activeShoots = savedShoots.filter(s => !s.deletedAt)
  const [selectedShootId, setSelectedShootId] = useState<string>(activeShootId ?? '')

  useEffect(() => {
    setLastScanFeedback(null)
    if (!currentOperator.trim()) return  // operator field will get focus via autoFocus
    scanRef.current?.focus()
  }, [])

  const canScan = !!currentOperator.trim()
  const selectedOption = OUT_TO_OPTIONS.find(o => o.key === outToKey) ?? OUT_TO_OPTIONS[0]

  // Stats across all shoots (or selected shoot)
  const shootItems = selectedShootId
    ? (activeShoots.find(s => s.id === selectedShootId)?.items ?? [])
    : activeShoots.flatMap(s => s.items)
  const allItems = activeShoots.flatMap(s => s.items)
  const atStudioCount   = allItems.filter(i => i.custodyLocation === 'at_studio').length
  const inTransitCount  = allItems.filter(i => i.custodyLocation === 'in_transit').length
  const dispatchedCount = allItems.filter(i => i.custodyLocation === 'dispatched_to_client').length

  const panelItems = shootItems.filter(i => {
    if (i.custodyLocation !== activeStatView) return false
    if (activeStatView === 'with_client') return (i.custodyHistory ?? []).length > 0
    return true
  })

  // ── Scan logic ──────────────────────────────────────────────────────────────

  function handleScan(barcode: string) {
    const raw = barcode.trim()
    if (!raw || !canScan) return

    // Find item across all shoots
    let foundItem: StockItem | null = null
    let foundShootId: string | null = null
    for (const shoot of savedShoots) {
      const match = shoot.items.find(i => matchesBarcode(i, raw))
      if (match) { foundItem = match; foundShootId = shoot.id; break }
    }

    if (!foundItem) {
      setLastScanFeedback({ id: Date.now().toString(), type: 'notFound', message: 'Item not found', scannedValue: raw })
      return
    }

    const { location: targetLocation, notes } = selectedOption

    // Warn if already at target and has been previously scanned (not just a default value)
    const hasHistory = (foundItem.custodyHistory ?? []).length > 0
    if (foundItem.custodyLocation === targetLocation && hasHistory) {
      setLastScanFeedback({
        id: Date.now().toString(),
        type: 'alreadyAtLocation',
        message: `Already ${locationLabel(targetLocation)}`,
        scannedValue: foundItem.styleNumber || foundItem.qrCodeValue,
      })
      return
    }

    // Proceed
    const prev = {
      custodyLocation: foundItem.custodyLocation,
      custodyHistory: foundItem.custodyHistory,
      lastScannedAt: foundItem.lastScannedAt,
      lastScannedBy: foundItem.lastScannedBy,
    }

    const now = new Date().toISOString()
    setCustody(foundItem.id, targetLocation, currentOperator, foundShootId ?? undefined, notes || undefined)

    setRecentScans(p => [
      {
        key: `${foundItem!.id}-${now}`,
        itemId: foundItem!.id,
        identifier: foundItem!.styleNumber || foundItem!.qrCodeValue,
        description: foundItem!.description,
        outToLabel: selectedOption.label,
        location: targetLocation,
        time: now,
        prev,
      },
      ...p,
    ].slice(0, 10))

    setLastScanFeedback({
      id: Date.now().toString(),
      type: 'success',
      message: selectedOption.label,
      scannedValue: foundItem.styleNumber || foundItem.qrCodeValue,
    })
  }

  function handleUndo(scan: RecentScan) {
    restoreItemState(scan.itemId, scan.prev)
    setRecentScans(p => p.filter(s => s.key !== scan.key))
    setLastScanFeedback({ id: Date.now().toString(), type: 'success', message: 'Scan undone', scannedValue: scan.identifier })
  }

  function triggerScan() {
    const v = scanInput.trim()
    if (!v) return
    handleScan(v)
    setScanInput('')
    setTimeout(() => scanRef.current?.focus(), 50)
  }

  function handleCameraScan(value: string) {
    handleScan(value)
    setShowCamera(false)
    setTimeout(() => scanRef.current?.focus(), 50)
  }

  // ── Feedback colour ──────────────────────────────────────────────────────────

  function feedbackColor() {
    if (!lastScanFeedback) return '#1565C0'
    switch (lastScanFeedback.type) {
      case 'success': return '#1565C0'
      case 'notFound': return '#B71C1C'
      case 'alreadyAtLocation': return '#E65100'
      default: return '#E65100'
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const STAT_PILLS = [
    { loc: 'at_studio'          as CustodyLocation, label: 'At Studio',  color: '#2E7D32', count: atStudioCount },
    { loc: 'in_transit'         as CustodyLocation, label: 'In Transit', color: '#1565C0', count: inTransitCount },
    { loc: 'dispatched_to_client' as CustodyLocation, label: 'Dispatched', color: '#6A1B9A', count: dispatchedCount },
  ]

  return (
    <div style={{ display: 'flex', height: '100%' }}>

      {/* ── Left: scan controls ── */}
      <div style={{ width: '500px', flexShrink: 0, overflowY: 'auto', padding: '1.5rem', background: '#F5F5F5' }}>

      {/* Stats / location tabs */}
      <div style={{ display: 'flex', background: '#fff', borderRadius: '10px', border: '1px solid #E0E0E0', marginBottom: '1rem', overflow: 'hidden' }}>
        {STAT_PILLS.map((pill, idx) => (
          <div key={pill.loc} style={{ display: 'flex', flex: 1 }}>
            {idx > 0 && <div style={{ width: '1px', background: '#E0E0E0' }} />}
            <StatPill
              value={pill.count} label={pill.label} color={pill.color}
              isActive={activeStatView === pill.loc}
              onClick={() => setActiveStatView(pill.loc)}
            />
          </div>
        ))}
      </div>

      {/* Controls + Scanner card */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E0E0E0', padding: '1.25rem', marginBottom: '1rem' }}>
        <p style={{ fontSize: '17px', fontWeight: 600, color: '#111', textAlign: 'center', marginBottom: '14px' }}>Scan Out</p>

        {/* Operator */}
        <ControlRow label="Operator">
          <input
            autoFocus={!currentOperator.trim()}
            value={currentOperator}
            onChange={e => setCurrentOperator(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && currentOperator.trim() && scanRef.current?.focus()}
            placeholder="Your name..."
            style={inputStyle(!!currentOperator)}
          />
        </ControlRow>

        {/* Shoot (context / filter) */}
        <ControlRow label="Shoot">
          <ShootPicker
            shoots={activeShoots}
            value={selectedShootId}
            onChange={setSelectedShootId}
            placeholder="All shoots"
          />
        </ControlRow>

        {/* Out To */}
        <ControlRow label="Out To">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {OUT_TO_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setOutToKey(opt.key)}
                style={{
                  padding: '5px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                  border: `1.5px solid ${outToKey === opt.key ? '#1565C0' : '#E0E0E0'}`,
                  background: outToKey === opt.key ? '#E3F2FD' : '#F9F9F9',
                  color: outToKey === opt.key ? '#1565C0' : '#666',
                  cursor: 'pointer',
                }}
              >
                {LOCATION_ICON[opt.location]} {opt.label}
              </button>
            ))}
          </div>
        </ControlRow>

        <hr style={{ border: 'none', borderTop: '1px solid #F0F0F0', margin: '12px 0' }} />

        {!canScan && (
          <p style={{ fontSize: '12px', color: '#E65100', textAlign: 'center', marginBottom: '10px', fontWeight: 500 }}>
            Enter operator name to begin scanning
          </p>
        )}

        {/* Scan input */}
        <input
          ref={scanRef}
          value={scanInput}
          onChange={e => setScanInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && triggerScan()}
          placeholder={canScan ? 'Scan or type barcode...' : 'Enter operator name first'}
          disabled={!canScan}
          style={{
            width: '100%', padding: '12px', fontSize: '18px', fontFamily: 'monospace',
            textAlign: 'center', border: `1px solid ${canScan ? '#E0E0E0' : '#F0F0F0'}`,
            borderRadius: '8px', boxSizing: 'border-box', marginBottom: '10px', outline: 'none',
            background: canScan ? '#fff' : '#FAFAFA', color: canScan ? '#111' : '#999',
          }}
        />

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={triggerScan} disabled={!canScan || !scanInput.trim()} style={{
            flex: 1, padding: '10px', fontSize: '14px', fontWeight: 600,
            background: (!canScan || !scanInput.trim()) ? '#E0E0E0' : '#1565C0',
            color: (!canScan || !scanInput.trim()) ? '#999' : '#fff',
            border: 'none', borderRadius: '8px',
            cursor: (canScan && scanInput.trim()) ? 'pointer' : 'default',
          }}>
            Scan Out
          </button>
          <button onClick={() => setShowCamera(true)} disabled={!canScan} style={{
            padding: '10px 14px', background: canScan ? '#1565C0' : '#E0E0E0', border: 'none',
            borderRadius: '8px', fontSize: '13px', cursor: canScan ? 'pointer' : 'default',
            color: canScan ? '#fff' : '#999',
          }}>
            Camera
          </button>
          <button onClick={() => setScanInput('')} style={{
            padding: '10px 14px', background: '#F5F5F5', border: 'none',
            borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#444',
          }}>
            Clear
          </button>
        </div>
      </div>

      {/* Feedback */}
      {lastScanFeedback && (
        <div style={{
          background: feedbackColor(), borderRadius: '10px',
          padding: '14px 16px', marginBottom: '1rem',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span style={{ fontSize: '20px' }}>
            {lastScanFeedback.type === 'success' ? LOCATION_ICON[selectedOption.location]
              : lastScanFeedback.type === 'notFound' ? '?' : '⚠'}
          </span>
          <div>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: '14px' }}>{lastScanFeedback.message}</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px', fontFamily: 'monospace' }}>{lastScanFeedback.scannedValue}</div>
          </div>
        </div>
      )}

      {/* Recent scans */}
      <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #E0E0E0', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', background: '#F5F5F5', fontSize: '12px', fontWeight: 600, color: '#666' }}>
          Recent scans this session
        </div>
        {recentScans.length === 0 ? (
          <p style={{ padding: '14px', fontSize: '12px', color: '#888' }}>No scans yet.</p>
        ) : recentScans.map((scan, i) => (
          <div key={scan.key} style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px',
            background: i % 2 === 0 ? '#fff' : '#F9F9F9',
          }}>
            <span style={{ fontSize: '14px' }}>{LOCATION_ICON[scan.location]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {scan.identifier}
              </div>
              {scan.description && <div style={{ fontSize: '10px', color: '#888' }}>{scan.description}</div>}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>{scan.outToLabel}</div>
              <div style={{ fontSize: '10px', color: '#aaa' }}>
                {new Date(scan.time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <button onClick={() => handleUndo(scan)} style={{
              padding: '4px 8px', background: '#F5F5F5', border: '1px solid #E0E0E0',
              borderRadius: '5px', fontSize: '11px', color: '#666', cursor: 'pointer', flexShrink: 0,
            }}>
              Undo
            </button>
          </div>
        ))}
      </div>

      {showCamera && (
        <CameraScanner onScan={handleCameraScan} onClose={() => setShowCamera(false)} />
      )}

      </div>{/* end left column */}

      {/* ── Right: item panel ── */}
      {(() => {
        const pill = STAT_PILLS.find(p => p.loc === activeStatView)!
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #E0E0E0', background: '#fff', minWidth: 0 }}>
            <div style={{ padding: '12px 16px', background: '#F5F5F5', borderBottom: '1px solid #E0E0E0', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: pill.color }}>{pill.label}</span>
              <span style={{ background: pill.color, color: '#fff', fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '99px' }}>
                {panelItems.length}
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: '11px', color: '#aaa' }}>
                {selectedShootId ? activeShoots.find(s => s.id === selectedShootId)?.name : 'All shoots'}
              </span>
            </div>

            <div style={{ display: 'flex', padding: '6px 14px', background: '#FAFAFA', borderBottom: '1px solid #F0F0F0', fontSize: '10px', fontWeight: 600, color: '#999', flexShrink: 0 }}>
              <span style={{ width: '28px' }}>#</span>
              <span style={{ width: '130px' }}>Style</span>
              <span style={{ flex: 1 }}>Description</span>
              <span style={{ width: '60px', textAlign: 'right' }}>Look</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {panelItems.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>
                  No items at this location
                </div>
              ) : panelItems.map((item, i) => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center',
                  padding: '7px 14px',
                  background: i % 2 === 0 ? '#fff' : '#FAFAFA',
                  borderBottom: '1px solid #F5F5F5',
                }}>
                  <span style={{ width: '28px', fontSize: '10px', color: '#bbb' }}>{i + 1}</span>
                  <span style={{ width: '130px', fontSize: '12px', fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.styleNumber}
                  </span>
                  <span style={{ flex: 1, fontSize: '11px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.description || '—'}
                  </span>
                  <span style={{ width: '60px', textAlign: 'right', fontSize: '10px', color: '#888' }}>
                    {item.looks.length > 0 ? item.looks.map(l => `L${l}`).join(', ') : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatPill({ value, label, color, isActive, onClick }: {
  value: number; label: string; color: string; isActive?: boolean; onClick?: () => void
}) {
  return (
    <div onClick={onClick} style={{
      flex: 1, textAlign: 'center', padding: '10px 8px',
      cursor: 'pointer',
      background: isActive ? color + '12' : 'transparent',
      transition: 'background 0.1s',
    }}>
      <div style={{ fontSize: '24px', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: '11px', color: isActive ? color : '#666', fontWeight: isActive ? 600 : 400 }}>{label}</div>
      {isActive && <div style={{ width: '24px', height: '2px', background: color, margin: '3px auto 0', borderRadius: '1px' }} />}
    </div>
  )
}

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
      <span style={{ fontSize: '12px', fontWeight: 600, color: '#666', width: '60px', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', fontSize: '13px', border: '1px solid #E0E0E0',
  borderRadius: '6px', background: '#fff', color: '#111', cursor: 'pointer',
}

function inputStyle(hasValue: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '6px 8px', fontSize: '13px',
    border: `1px solid ${hasValue ? '#2E7D32' : '#E0E0E0'}`,
    borderRadius: '6px', outline: 'none', boxSizing: 'border-box',
  }
}
