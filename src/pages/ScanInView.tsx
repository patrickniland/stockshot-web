// StockShot — Scan In View

import { useState, useRef, useEffect } from 'react'
import useAppStore from '../store/useAppStore'
import { useNavSync } from '../hooks/useNavSync'
import { StockItem, CustodyLocation, CustodyEvent } from '../types'
import CameraScanner from '../components/CameraScanner'
import ShootPicker from '../components/ShootPicker'

// ── Types ─────────────────────────────────────────────────────────────────────

type RecentScan = {
  key: string
  itemId: string
  identifier: string
  description: string
  location: CustodyLocation
  time: string
  prev: Pick<StockItem, 'custodyLocation' | 'custodyHistory' | 'lastScannedAt' | 'lastScannedBy'>
}

type PendingAction =
  | { type: 'wrongShoot'; item: StockItem; fromShootId: string; fromShootName: string }
  | { type: 'confirmAdd'; barcode: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseScan(raw: string): string {
  const t = raw.trim()
  const parts = t.split('-')
  if (parts.length === 3 && parts.every(p => /^\d+$/.test(p))) return parts[1]
  if (/^\d+$/.test(t) && t.length >= 4) return t.slice(2, -1)
  return t
}

function matchesBarcode(item: StockItem, raw: string): boolean {
  try {
    const norm = normaliseScan(raw).toLowerCase()
    const rawL = raw.toLowerCase()
    const extras = Object.values(item.extraFields ?? {}).map(v => String(v).toLowerCase())
    return (
      item.sku.toLowerCase() === rawL || item.sku.toLowerCase() === norm ||
      item.qrCodeValue.toLowerCase() === rawL || item.qrCodeValue.toLowerCase() === norm ||
      item.styleNumber.toLowerCase() === rawL || item.styleNumber.toLowerCase() === norm ||
      extras.some(v => v === rawL || v === norm)
    )
  } catch {
    return false
  }
}

function locationLabel(loc: CustodyLocation): string {
  switch (loc) {
    case 'at_studio':  return 'At Studio'
    case 'at_client':  return 'At Client'
    case 'in_transit': return 'In Transit'
  }
}

const LOCATION_ICON: Record<CustodyLocation, string> = {
  at_client:  '📦',
  in_transit: '🚚',
  at_studio:  '🏠',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScanInView() {
  useNavSync({ onEnter: 'pull' })
  const inputRef = useRef<HTMLInputElement>(null)
  const [scanInput, setScanInput] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const [recentScans, setRecentScans] = useState<RecentScan[]>([])
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [activeStatView, setActiveStatView] = useState<CustodyLocation>('at_studio')

  const savedShoots = useAppStore(s => s.savedShoots)
  const activeShootId = useAppStore(s => s.activeShootId)
  const setActiveShootId = useAppStore(s => s.setActiveShootId)
  const scanInLocation = useAppStore(s => s.scanInLocation)
  const setScanInLocation = useAppStore(s => s.setScanInLocation)
  const currentOperator = useAppStore(s => s.currentOperator)
  const setCurrentOperator = useAppStore(s => s.setCurrentOperator)
  const currentIntakeLook = useAppStore(s => s.currentIntakeLook)
  const setCurrentIntakeLook = useAppStore(s => s.setCurrentIntakeLook)
  const bumpLook = useAppStore(s => s.bumpLook)
  const stylingMode = useAppStore(s => s.stylingMode)
  const setStylingMode = useAppStore(s => s.setStylingMode)
  const setCustody = useAppStore(s => s.setCustody)
  const moveItemsToShoot = useAppStore(s => s.moveItemsToShoot)
  const addItemToShoot = useAppStore(s => s.addItemToShoot)
  const restoreItemState = useAppStore(s => s.restoreItemState)
  const setLastScanFeedback = useAppStore(s => s.setLastScanFeedback)
  const lastScanFeedback = useAppStore(s => s.lastScanFeedback)

  // All non-deleted shoots for the dropdown
  const activeShoots = savedShoots.filter(s => !s.deletedAt)

  const [selectedShootId, setSelectedShootId] = useState<string>(activeShootId ?? '')

  function selectShoot(id: string) {
    setSelectedShootId(id)
    setActiveShootId(id)
  }

  // Sync selectedShootId if activeShootId changes and selection becomes invalid
  useEffect(() => {
    if (selectedShootId && activeShoots.some(s => s.id === selectedShootId)) return
    setSelectedShootId(activeShootId ?? activeShoots[0]?.id ?? '')
  }, [activeShootId])

  useEffect(() => {
    setLastScanFeedback(null)
    inputRef.current?.focus()
  }, [])

  const selectedShoot = savedShoots.find(s => s.id === selectedShootId) ?? null
  const lookOrder = selectedShoot?.lookOrder ?? []
  const totalLooks = lookOrder.length > 0 ? Math.max(...lookOrder) : 0

  const canScan = !!currentOperator.trim() && !!selectedShootId

  // Stats for the selected shoot
  // with_client only counts items formally scanned (has history) — unscanned imports default to with_client
  // and would otherwise make the count look non-zero before any scanning.
  const shootItems = selectedShoot?.items ?? []
  const atStudioCount  = shootItems.filter(i => i.custodyLocation === 'at_studio').length
  const atClientCount  = shootItems.filter(i => i.custodyLocation === 'at_client' && (i.custodyHistory ?? []).length > 0).length
  const inTransitCount = shootItems.filter(i => i.custodyLocation === 'in_transit').length

  const panelItems = shootItems.filter(i => {
    if (i.custodyLocation !== activeStatView) return false
    if (activeStatView === 'at_client') return (i.custodyHistory ?? []).length > 0
    return true
  })

  // ── Scan logic ──────────────────────────────────────────────────────────────

  function handleScan(barcode: string) {
    const raw = barcode.trim()
    console.log('[Scan] handleScan — raw:', raw, '| canScan:', canScan, '| operator:', JSON.stringify(currentOperator), '| selectedShootId:', selectedShootId)
    const selectedShootItems = savedShoots.find(s => s.id === selectedShootId)?.items ?? []
    console.log('[Scan] selectedShoot items:', selectedShootItems.length, '| total shoots:', savedShoots.map(s => `${s.name}(${s.items.length})`).join(', '))
    if (!raw || !canScan) return

    // Search all shoots for a matching item
    let foundItem: StockItem | null = null
    let foundShootId: string | null = null
    for (const shoot of savedShoots) {
      const match = shoot.items.find(i => matchesBarcode(i, raw))
      if (match) { foundItem = match; foundShootId = shoot.id; break }
    }

    if (!foundItem) {
      // Not found — prompt to add
      if (selectedShoot?.isUnassigned) {
        // Auto-add to Unassigned shoot
        doAddNewItem(raw)
      } else {
        setPendingAction({ type: 'confirmAdd', barcode: raw })
      }
      return
    }

    // Found — check if it's in the right shoot
    if (foundShootId !== selectedShootId) {
      const fromShoot = savedShoots.find(s => s.id === foundShootId)
      setPendingAction({
        type: 'wrongShoot',
        item: foundItem,
        fromShootId: foundShootId!,
        fromShootName: fromShoot?.name ?? 'another shoot',
      })
      return
    }

    // Already at this location AND has been previously scanned (not just a default value)?
    const hasHistory = (foundItem.custodyHistory ?? []).length > 0
    if (foundItem.custodyLocation === scanInLocation && hasHistory) {
      appendFeedback('already', foundItem)
      return
    }

    doScanItem(foundItem, foundShootId!)
  }

  function doScanItem(item: StockItem, shootId: string) {
    const prev = {
      custodyLocation: item.custodyLocation,
      custodyHistory: item.custodyHistory,
      lastScannedAt: item.lastScannedAt,
      lastScannedBy: item.lastScannedBy,
    }

    const now = new Date().toISOString()
    const looks = currentIntakeLook > 0 && !item.looks.includes(currentIntakeLook)
      ? [...item.looks, currentIntakeLook]
      : item.looks

    setCustody(item.id, scanInLocation, currentOperator, shootId)

    if (stylingMode) {
      useAppStore.getState().updateItem(item.id, { looks, shotStatus: 'notRequired' })
    } else if (looks !== item.looks) {
      useAppStore.getState().updateItem(item.id, { looks })
    }

    setRecentScans(prev2 => [
      {
        key: `${item.id}-${now}`,
        itemId: item.id,
        identifier: item.styleNumber || item.qrCodeValue,
        description: item.description,
        location: scanInLocation,
        time: now,
        prev,
      },
      ...prev2,
    ].slice(0, 10))

    setLastScanFeedback({
      id: Date.now().toString(),
      type: 'success',
      message: stylingMode ? 'Confirmed for Styling' : locationLabel(scanInLocation),
      scannedValue: item.styleNumber || item.qrCodeValue,
    })
  }

  function appendFeedback(type: 'already', item: StockItem) {
    // Visual warning — no history change
    const loc = locationLabel(item.custodyLocation)
    setLastScanFeedback({
      id: Date.now().toString(),
      type: 'alreadyAtLocation',
      message: `Already ${loc}`,
      scannedValue: item.styleNumber || item.qrCodeValue,
    })
  }

  function doAddNewItem(barcode: string) {
    if (!selectedShootId) return
    const now = new Date().toISOString()
    const event: CustodyEvent = {
      location: scanInLocation,
      timestamp: now,
      operator: currentOperator,
      shoot_id: selectedShootId,
    }
    const newItem: StockItem = {
      id: crypto.randomUUID(),
      styleNumber: barcode,
      sku: barcode,
      qrCodeValue: barcode,
      description: '',
      extraFields: {},
      custodyLocation: scanInLocation,
      custodyHistory: [event],
      lastScannedAt: now,
      lastScannedBy: currentOperator,
      shotStatus: stylingMode ? 'notRequired' : 'notShot',
      shotAt: null,
      productType: null,
      requiredAngles: [],
      completedAngles: [],
      looks: currentIntakeLook > 0 ? [currentIntakeLook] : [],
      notes: '',
      dropId: null,
    }
    addItemToShoot(newItem, selectedShootId)
    setRecentScans(prev => [
      {
        key: `${newItem.id}-${now}`,
        itemId: newItem.id,
        identifier: barcode,
        description: '',
        location: scanInLocation,
        time: now,
        prev: { custodyLocation: 'at_client', custodyHistory: [], lastScannedAt: null, lastScannedBy: null },
      },
      ...prev,
    ].slice(0, 10))
    setLastScanFeedback({
      id: Date.now().toString(),
      type: 'success',
      message: 'Added as new item',
      scannedValue: barcode,
    })
  }

  function handleUndo(scan: RecentScan) {
    restoreItemState(scan.itemId, scan.prev)
    setRecentScans(prev => prev.filter(s => s.key !== scan.key))
    setLastScanFeedback({
      id: Date.now().toString(),
      type: 'success',
      message: 'Scan undone',
      scannedValue: scan.identifier,
    })
  }

  function triggerScan() {
    const v = scanInput.trim()
    if (!v) return
    handleScan(v)
    setScanInput('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function handleCameraScan(value: string) {
    handleScan(value)
    setShowCamera(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const STAT_PILLS: { loc: CustodyLocation; label: string; color: string; count: number }[] = [
    { loc: 'at_studio',  label: 'At Studio',  color: '#2E7D32', count: atStudioCount },
    { loc: 'at_client',  label: 'At Client',  color: '#E65100', count: atClientCount },
    { loc: 'in_transit', label: 'In Transit', color: '#1565C0', count: inTransitCount },
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
      <div style={{ background: '#fff', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem', border: `1.5px solid ${stylingMode ? '#F59E0B' : '#E0E0E0'}` }}>
        <p style={{ fontSize: '17px', fontWeight: 600, color: '#111', textAlign: 'center', marginBottom: '14px' }}>Scan In</p>

        {/* Operator */}
        <ControlRow label="Operator">
          <input
            value={currentOperator}
            onChange={e => setCurrentOperator(e.target.value)}
            placeholder="Your name..."
            style={inputStyle(!!currentOperator)}
          />
        </ControlRow>

        {/* Shoot selector */}
        <ControlRow label="Shoot">
          <ShootPicker
            shoots={activeShoots}
            value={selectedShootId}
            onChange={selectShoot}
          />
        </ControlRow>

        {/* Location */}
        <ControlRow label="Location">
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['at_studio', 'at_client'] as CustodyLocation[]).map(loc => (
              <button
                key={loc}
                onClick={() => setScanInLocation(loc)}
                style={{
                  padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                  border: `1.5px solid ${scanInLocation === loc ? '#2E7D32' : '#E0E0E0'}`,
                  background: scanInLocation === loc ? '#E8F5E9' : '#F9F9F9',
                  color: scanInLocation === loc ? '#2E7D32' : '#666',
                  cursor: 'pointer',
                }}
              >
                {locationLabel(loc)}
              </button>
            ))}
          </div>
        </ControlRow>

        {/* Look stepper */}
        <ControlRow label="Look">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button onClick={() => currentIntakeLook > 1 && setCurrentIntakeLook(currentIntakeLook - 1)}
              disabled={currentIntakeLook <= 1}
              style={lookNavBtn(currentIntakeLook > 1)}>‹</button>
            <div style={{ flex: 1, textAlign: 'center', background: currentIntakeLook === 0 ? '#666' : '#7B1FA2', color: '#fff', padding: '5px 10px', borderRadius: '6px', minWidth: '80px' }}>
              {currentIntakeLook === 0
                ? <span style={{ fontSize: '12px', fontWeight: 700 }}>No Look</span>
                : <span style={{ fontSize: '12px', fontWeight: 700 }}>Look {currentIntakeLook} <span style={{ opacity: 0.7 }}>/ {totalLooks}</span></span>
              }
            </div>
            <button onClick={() => currentIntakeLook < totalLooks && setCurrentIntakeLook(currentIntakeLook + 1)}
              disabled={currentIntakeLook >= totalLooks}
              style={lookNavBtn(currentIntakeLook < totalLooks)}>›</button>
            <button onClick={bumpLook} style={newLookBtn}>+ Look</button>
          </div>
        </ControlRow>

        {/* Styling Mode toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <button
            onClick={() => setStylingMode(!stylingMode)}
            style={{
              flex: 1, padding: '7px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
              border: `1.5px solid ${stylingMode ? '#F59E0B' : '#E0E0E0'}`,
              background: stylingMode ? '#FFF8E1' : '#F9F9F9',
              color: stylingMode ? '#B45309' : '#666',
              cursor: 'pointer',
            }}
          >
            {stylingMode ? '✦ Styling Mode ON' : 'Enter Styling Mode'}
          </button>
          {stylingMode && (
            <button
              onClick={() => setStylingMode(false)}
              style={{
                padding: '7px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 700,
                background: '#F59E0B', border: 'none', color: '#fff', cursor: 'pointer',
              }}
            >
              EXIT
            </button>
          )}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #F0F0F0', marginBottom: '14px' }} />

        {/* Operator required hint */}
        {!currentOperator.trim() && (
          <p style={{ fontSize: '12px', color: '#E65100', textAlign: 'center', marginBottom: '10px', fontWeight: 500 }}>
            Enter operator name to begin scanning
          </p>
        )}

        {/* Scan input */}
        <input
          ref={inputRef}
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
            background: (!canScan || !scanInput.trim()) ? '#E0E0E0' : stylingMode ? '#F59E0B' : '#2E7D32',
            color: (!canScan || !scanInput.trim()) ? '#999' : '#fff',
            border: 'none', borderRadius: '8px', cursor: (canScan && scanInput.trim()) ? 'pointer' : 'default',
          }}>
            ✓ Scan In
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

      {/* Scan feedback banner */}
      {lastScanFeedback && (
        <div style={{
          borderRadius: '10px',
          padding: '14px 16px',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: lastScanFeedback.type === 'success'
            ? (stylingMode ? '#F59E0B' : '#2E7D32')
            : lastScanFeedback.type === 'alreadyAtLocation' ? '#E65100'
            : '#B71C1C',
        }}>
          <span style={{ fontSize: '20px' }}>
            {lastScanFeedback.type === 'success' ? LOCATION_ICON[scanInLocation] : '⚠'}
          </span>
          <div>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: '14px' }}>{lastScanFeedback.message}</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px', fontFamily: 'monospace' }}>{lastScanFeedback.scannedValue}</div>
          </div>
        </div>
      )}

      {/* Pending action: wrong shoot */}
      {pendingAction?.type === 'wrongShoot' && (
        <div style={{ background: '#FFF3E0', borderRadius: '10px', padding: '14px', marginBottom: '1rem', border: '1.5px solid #FF9800' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E65100', marginBottom: '8px' }}>
            Item found in a different shoot: <em>{pendingAction.fromShootName}</em>
          </p>
          <p style={{ fontSize: '12px', color: '#444', marginBottom: '10px' }}>
            {pendingAction.item.styleNumber || pendingAction.item.qrCodeValue}
            {pendingAction.item.description ? ` — ${pendingAction.item.description}` : ''}
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => {
              moveItemsToShoot([pendingAction.item.id], selectedShootId)
              doScanItem({ ...pendingAction.item }, selectedShootId)
              setPendingAction(null)
            }} style={{ flex: 1, padding: '8px', background: '#E65100', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              Move to {selectedShoot?.name ?? 'selected shoot'} + Scan In
            </button>
            <button onClick={() => {
              doScanItem(pendingAction.item, pendingAction.fromShootId)
              setPendingAction(null)
            }} style={{ padding: '8px 12px', background: '#F5F5F5', color: '#444', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
              Keep in current shoot
            </button>
            <button onClick={() => setPendingAction(null)} style={{ padding: '8px 12px', background: '#F5F5F5', color: '#888', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Pending action: not found, confirm add */}
      {pendingAction?.type === 'confirmAdd' && (
        <div style={{ background: '#FFEBEE', borderRadius: '10px', padding: '14px', marginBottom: '1rem', border: '1.5px solid #EF5350' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#B71C1C', marginBottom: '6px' }}>
            Item not found: <code style={{ fontFamily: 'monospace' }}>{pendingAction.barcode}</code>
          </p>
          <p style={{ fontSize: '12px', color: '#444', marginBottom: '10px' }}>
            Add as a new item to <em>{selectedShoot?.name}</em>?
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => { doAddNewItem(pendingAction.barcode); setPendingAction(null) }}
              style={{ flex: 1, padding: '8px', background: '#B71C1C', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              Add to {selectedShoot?.name ?? 'shoot'}
            </button>
            <button onClick={() => setPendingAction(null)}
              style={{ padding: '8px 12px', background: '#F5F5F5', color: '#888', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
              Cancel
            </button>
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
              {scan.description && (
                <div style={{ fontSize: '10px', color: '#888' }}>{scan.description}</div>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>
                {locationLabel(scan.location)}
              </div>
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
        const pill = STAT_PILLS.find(p => p.loc === activeStatView) ?? STAT_PILLS[0]
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #E0E0E0', background: '#fff', minWidth: 0 }}>
            {/* Panel header */}
            <div style={{ padding: '12px 16px', background: '#F5F5F5', borderBottom: '1px solid #E0E0E0', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: pill.color }}>{pill.label}</span>
              <span style={{ background: pill.color, color: '#fff', fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '99px' }}>
                {panelItems.length}
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: '11px', color: '#aaa' }}>{selectedShoot?.name ?? 'No shoot selected'}</span>
            </div>

            {/* Column headers */}
            <div style={{ display: 'flex', padding: '6px 14px', background: '#FAFAFA', borderBottom: '1px solid #F0F0F0', fontSize: '10px', fontWeight: 600, color: '#999', flexShrink: 0 }}>
              <span style={{ width: '28px' }}>#</span>
              <span style={{ width: '130px' }}>Style</span>
              <span style={{ flex: 1 }}>Description</span>
              <span style={{ width: '60px', textAlign: 'right' }}>Look</span>
            </div>

            {/* Items */}
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

// ── Styles ────────────────────────────────────────────────────────────────────

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

function lookNavBtn(active: boolean): React.CSSProperties {
  return {
    width: '28px', height: '28px', borderRadius: '5px', border: '1px solid #E0E0E0',
    background: active ? '#F5F5F5' : '#FAFAFA', color: active ? '#7B1FA2' : '#ccc',
    fontSize: '16px', cursor: active ? 'pointer' : 'default',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}

const newLookBtn: React.CSSProperties = {
  background: '#EDE9FE', color: '#7B1FA2', border: 'none',
  padding: '5px 10px', borderRadius: '6px', fontSize: '11px',
  cursor: 'pointer', fontWeight: 600,
}
