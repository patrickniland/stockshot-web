import { useState, useRef, useEffect } from 'react'
import {
  CaretLeft, CaretRight, Camera, X, ArrowCounterClockwise, Gear, Package,
  CircleNotch, ScanSmiley, SpeakerHigh, SpeakerSimpleSlash,
} from '@phosphor-icons/react'
import useAppStore from '../store/useAppStore'
import { useNavSync } from '../hooks/useNavSync'
import { useToast } from '../hooks/useToast'
import { StockItem, CustodyLocation, CustodyEvent } from '../types'
import CameraScanner from '../components/CameraScanner'
import OperatorPinEntry from '../components/OperatorPinEntry'
import ShootPicker from '../components/ShootPicker'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'

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

const LOCATION_STYLE: Record<CustodyLocation, { text: string; bg: string; activeBg: string }> = {
  at_studio:  { text: 'text-[var(--color-success)]', bg: 'bg-[var(--color-success)]', activeBg: 'bg-[var(--color-success)]/10' },
  at_client:  { text: 'text-[var(--color-warning)]', bg: 'bg-[var(--color-warning)]', activeBg: 'bg-[var(--color-warning)]/10' },
  in_transit: { text: 'text-[var(--color-info)]',    bg: 'bg-[var(--color-info)]',    activeBg: 'bg-[var(--color-info)]/10' },
}

function playTick() {
  try {
    const actx = new AudioContext()
    const osc = actx.createOscillator()
    const gain = actx.createGain()
    osc.connect(gain)
    gain.connect(actx.destination)
    osc.type = 'sine'
    osc.frequency.value = 1200
    gain.gain.setValueAtTime(0.15, actx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.08)
    osc.start(actx.currentTime)
    osc.stop(actx.currentTime + 0.08)
    setTimeout(() => actx.close(), 500)
  } catch {}
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScanInView() {
  useNavSync({ onEnter: 'pull' })
  const { addToast } = useToast()

  const scanInputRef = useRef<HTMLInputElement>(null)
  const lastScannedRef = useRef<{ barcode: string; at: number } | null>(null)
  const [scanInput, setScanInput] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const [recentScans, setRecentScans] = useState<RecentScan[]>([])
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [activeStatView, setActiveStatView] = useState<CustodyLocation>(
    () => useAppStore.getState().scanInLocation
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [showAllScans, setShowAllScans] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [flashState, setFlashState] = useState<'success' | 'error' | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem('stockshot_scan_sound') === 'true'
  )

  const savedShoots = useAppStore(s => s.savedShoots)
  const activeShootId = useAppStore(s => s.activeShootId)
  const setActiveShootId = useAppStore(s => s.setActiveShootId)
  const scanInLocation = useAppStore(s => s.scanInLocation)
  const setScanInLocation = useAppStore(s => s.setScanInLocation)
  const currentOperator = useAppStore(s => s.currentOperator)
  const currentIntakeLook = useAppStore(s => s.currentIntakeLook)
  const setCurrentIntakeLook = useAppStore(s => s.setCurrentIntakeLook)
  const bumpLook = useAppStore(s => s.bumpLook)
  const stylingMode = useAppStore(s => s.stylingMode)
  const setStylingMode = useAppStore(s => s.setStylingMode)
  const commitScanIn = useAppStore(s => s.commitScanIn)
  const addItemToShoot = useAppStore(s => s.addItemToShoot)
  const restoreItemState = useAppStore(s => s.restoreItemState)
  const removeItemFromShoot = useAppStore(s => s.removeItemFromShoot)
  const setLastScanFeedback = useAppStore(s => s.setLastScanFeedback)
  const lastScanFeedback = useAppStore(s => s.lastScanFeedback)

  const activeShoots = savedShoots.filter(s => !s.deletedAt)
  const [selectedShootId, setSelectedShootId] = useState<string>(activeShootId ?? '')

  function selectShoot(id: string) {
    setSelectedShootId(id)
    setActiveShootId(id)
  }

  useEffect(() => {
    if (selectedShootId && activeShoots.some(s => s.id === selectedShootId)) return
    setSelectedShootId(activeShootId ?? activeShoots[0]?.id ?? '')
  }, [activeShootId])

  useEffect(() => {
    setActiveStatView(scanInLocation)
  }, [scanInLocation])

  useEffect(() => {
    setLastScanFeedback(null)
    scanInputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!lastScanFeedback) return
    const t = setTimeout(() => setLastScanFeedback(null), 350)
    return () => clearTimeout(t)
  }, [lastScanFeedback])

  const selectedShoot = savedShoots.find(s => s.id === selectedShootId) ?? null
  const lookOrder = selectedShoot?.lookOrder ?? []
  const totalLooks = lookOrder.length > 0 ? Math.max(...lookOrder) : 0
  const canScan = !!currentOperator.trim() && !!selectedShootId

  const shootItems = selectedShoot?.items ?? []
  const atStudioCount  = shootItems.filter(i => i.custodyLocation === 'at_studio').length
  const atClientCount  = shootItems.filter(i => i.custodyLocation === 'at_client' && (i.custodyHistory ?? []).length > 0).length
  const inTransitCount = shootItems.filter(i => i.custodyLocation === 'in_transit').length

  const panelItems = shootItems.filter(i => {
    if (i.custodyLocation !== activeStatView) return false
    if (activeStatView === 'at_client') return (i.custodyHistory ?? []).length > 0
    return true
  })

  const atClientItems = shootItems.filter(i =>
    i.custodyLocation === 'at_client' && (i.custodyHistory ?? []).length > 0
  )


  // ── Feedback helpers ─────────────────────────────────────────────────────────

  function triggerSuccess() {
    setFlashState('success')
    setTimeout(() => setFlashState(null), 350)
    try { navigator.vibrate(50) } catch {}
    if (soundEnabled) playTick()
  }

  function triggerError(message: string) {
    setFlashState('error')
    setTimeout(() => setFlashState(null), 350)
    try { navigator.vibrate([100, 50, 100]) } catch {}
    addToast('error', message)
  }

  function toggleSound() {
    const next = !soundEnabled
    setSoundEnabled(next)
    localStorage.setItem('stockshot_scan_sound', String(next))
  }

  // ── Scan logic ──────────────────────────────────────────────────────────────

  function handleScan(barcode: string) {
    const raw = barcode.trim()
    if (!raw || !canScan || pendingAction) return

    // Debounce: drop duplicate barcode fired within 600ms (mode-toggle double-fire)
    const now = Date.now()
    if (lastScannedRef.current?.barcode === raw && now - lastScannedRef.current.at < 600) return
    lastScannedRef.current = { barcode: raw, at: now }

    // Only search the current shoot — items in other shoots are independent
    const currentShoot = useAppStore.getState().savedShoots.find(s => s.id === selectedShootId)
    const foundItem = currentShoot?.items.find(i => matchesBarcode(i, raw)) ?? null

    if (!foundItem) {
      if (selectedShoot?.isUnassigned) {
        doAddNewItem(raw)
      } else {
        setFlashState('error')
        setTimeout(() => setFlashState(null), 350)
        try { navigator.vibrate([100, 50, 100]) } catch {}
        setPendingAction({ type: 'confirmAdd', barcode: raw })
      }
      return
    }

    const hasHistory = (foundItem.custodyHistory ?? []).length > 0
    if (foundItem.custodyLocation === scanInLocation && hasHistory) {
      triggerError(`Already ${locationLabel(scanInLocation)} — ${foundItem.styleNumber || foundItem.qrCodeValue}`)
      appendFeedback('already', foundItem)
      return
    }

    doScanItem(foundItem, selectedShootId!)
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

    commitScanIn(
      item.id,
      shootId,
      scanInLocation,
      currentOperator,
      looks,
      stylingMode ? 'notRequired' : undefined,
    )

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

    setActiveStatView(scanInLocation)
    triggerSuccess()
  }

  function appendFeedback(type: 'already', item: StockItem) {
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
    setActiveStatView(scanInLocation)
    triggerSuccess()
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
    setScanning(true)
    handleScan(v)
    setScanInput('')
    setTimeout(() => {
      setScanning(false)
      scanInputRef.current?.focus()
    }, 300)
  }

  function handleCameraScan(value: string) {
    setScanning(true)
    handleScan(value)
    setShowCamera(false)
    setTimeout(() => {
      setScanning(false)
      scanInputRef.current?.focus()
    }, 300)
  }

  // ── Shared fragments ────────────────────────────────────────────────────────

  const statRows: { loc: CustodyLocation; label: string; count: number }[] = [
    { loc: 'at_studio',  label: 'At Studio',  count: atStudioCount },
    { loc: 'at_client',  label: 'At Client',  count: atClientCount },
    { loc: 'in_transit', label: 'In Transit', count: inTransitCount },
  ]

  const settingsFields = (
    <div className="flex flex-col gap-3">
      <ControlRow label="Operator">
        <OperatorPinEntry />
      </ControlRow>

      <ControlRow label="Shoot">
        <ShootPicker shoots={activeShoots} value={selectedShootId} onChange={selectShoot} />
      </ControlRow>

      <ControlRow label="Location">
        <div className="flex gap-1.5">
          {(['at_studio', 'at_client', 'in_transit'] as CustodyLocation[]).map(loc => (
            <button
              key={loc}
              onClick={() => setScanInLocation(loc)}
              className={[
                'px-3 py-1.5 rounded-[var(--radius-md)] text-[var(--text-sm)] font-semibold border touch-target transition-colors',
                scanInLocation === loc
                  ? `border-[var(--color-success)] ${LOCATION_STYLE[loc].activeBg} ${LOCATION_STYLE[loc].text}`
                  : 'border-[var(--color-border)] bg-white text-slate-500 hover:bg-slate-50',
              ].join(' ')}
            >
              {locationLabel(loc)}
            </button>
          ))}
        </div>
      </ControlRow>

      <ControlRow label="Look">
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary" size="sm"
            onClick={() => currentIntakeLook > 1 && setCurrentIntakeLook(currentIntakeLook - 1)}
            disabled={currentIntakeLook <= 1}
            className="w-8 px-0 flex items-center justify-center"
          >
            <CaretLeft size={14} />
          </Button>
          <div className="flex-1 text-center bg-[var(--color-accent)] text-white px-3 py-1.5 rounded-[var(--radius-md)] text-[var(--text-sm)] font-semibold min-w-[80px]">
            {currentIntakeLook === 0 ? 'No Look' : `Look ${currentIntakeLook} / ${totalLooks}`}
          </div>
          <Button
            variant="secondary" size="sm"
            onClick={() => currentIntakeLook < totalLooks && setCurrentIntakeLook(currentIntakeLook + 1)}
            disabled={currentIntakeLook >= totalLooks}
            className="w-8 px-0 flex items-center justify-center"
          >
            <CaretRight size={14} />
          </Button>
          <Button variant="secondary" size="sm" onClick={bumpLook}>
            + Look
          </Button>
        </div>
      </ControlRow>

      {/* Sound toggle */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)]">
        <span className="text-[var(--text-xs)] text-slate-500">Scan sound</span>
        <button
          onClick={toggleSound}
          className="flex items-center gap-1.5 text-[var(--text-xs)] touch-target px-2 rounded-[var(--radius-sm)] hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
        >
          {soundEnabled ? <SpeakerHigh size={14} /> : <SpeakerSimpleSlash size={14} />}
          {soundEnabled ? 'On' : 'Off'}
        </button>
      </div>
    </div>
  )

  const scanField = (
    <div className="flex flex-col gap-3">
      {!currentOperator.trim() && (
        <p className="text-[var(--text-xs)] text-[var(--color-warning)] text-center font-medium">
          Enter your operator PIN to begin scanning
        </p>
      )}

      {/* Flash wrapper — shadow pulses green/red on scan result */}
      <div className={[
        'rounded-[var(--radius-md)] transition-shadow duration-150',
        flashState === 'success' ? 'shadow-[0_0_0_3px_var(--color-success)]' :
        flashState === 'error'   ? 'shadow-[0_0_0_3px_var(--color-danger)]'  : '',
      ].join(' ')}>
        <Input
          ref={scanInputRef}
          scannerMode
          value={scanInput}
          onChange={e => setScanInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && triggerScan()}
          placeholder={canScan ? 'Scan or type barcode...' : 'Enter operator name first'}
          disabled={!canScan}
          className="text-center font-mono text-[var(--text-xl)] py-3"
        />
      </div>

      <div className="flex gap-2">
        <Button
          variant="primary" size="lg"
          className="flex-1"
          onClick={triggerScan}
          disabled={!canScan || !scanInput.trim() || scanning}
        >
          {scanning
            ? <CircleNotch size={18} className="animate-spin" />
            : '✓ Scan In'}
        </Button>
        <Button
          variant="primary" size="lg"
          Icon={Camera}
          onClick={() => setShowCamera(true)}
          disabled={!canScan || scanning}
        >
          Camera
        </Button>
        <Button variant="ghost" size="lg" onClick={() => setScanInput('')}>
          Clear
        </Button>
      </div>
    </div>
  )

  const feedbackBanner = lastScanFeedback && (
    <div className={[
      'rounded-[var(--radius-lg)] px-4 py-3 flex items-center gap-3',
      lastScanFeedback.type === 'success'
        ? stylingMode ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-success)]'
        : lastScanFeedback.type === 'alreadyAtLocation' ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-danger)]',
    ].join(' ')}>
      <div>
        <div className="text-white font-semibold text-[var(--text-sm)]">{lastScanFeedback.message}</div>
        <div className="text-white/80 text-[var(--text-xs)] font-mono">{lastScanFeedback.scannedValue}</div>
      </div>
    </div>
  )

  const pendingActions = (
    <>
      {pendingAction?.type === 'confirmAdd' && (
        <Card className="border-[var(--color-danger)] bg-red-50">
          <p className="text-[var(--text-sm)] font-semibold text-[var(--color-danger)] mb-1">
            Item not found: <code className="font-mono">{pendingAction.barcode}</code>
          </p>
          <p className="text-[var(--text-xs)] text-slate-600 mb-3">
            Add as a new item to <em>{selectedShoot?.name}</em>?
          </p>
          <div className="flex gap-2">
            <Button variant="danger" size="sm" className="flex-1" onClick={() => {
              doAddNewItem(pendingAction.barcode)
              setPendingAction(null)
            }}>
              Add to {selectedShoot?.name ?? 'shoot'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPendingAction(null)}>Cancel</Button>
          </div>
        </Card>
      )}
    </>
  )

  const recentScansList = (maxVisible?: number) => {
    const displayed = maxVisible ? recentScans.slice(0, maxVisible) : recentScans
    return (
      <Card padding="sm" className="overflow-hidden">
        <div className="px-2 py-1.5 mb-1 text-[var(--text-xs)] font-semibold text-slate-500 uppercase tracking-wide">
          Recent scans this session
        </div>
        {recentScans.length === 0 ? (
          // Phone: icon + subtext. Tablet+: plain text
          <>
            <div className="md:hidden flex flex-col items-center py-8 gap-2 text-slate-300">
              <ScanSmiley size={64} weight="duotone" />
              <span className="text-[var(--text-sm)] text-slate-400">Scan to begin</span>
            </div>
            <p className="hidden md:block px-2 py-3 text-[var(--text-xs)] text-slate-400">No scans yet.</p>
          </>
        ) : (
          <>
            {displayed.map((scan, i) => {
              const style = LOCATION_STYLE[scan.location]
              return (
                <div
                  key={scan.key}
                  className={`flex items-center gap-2 px-2 py-2 rounded-[var(--radius-sm)] ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.bg}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[var(--text-sm)] font-medium text-slate-900 truncate">{scan.identifier}</div>
                    {scan.description && (
                      <div className="text-[var(--text-xs)] text-slate-400 truncate">{scan.description}</div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-[var(--text-xs)] ${style.text}`}>{locationLabel(scan.location)}</div>
                    <div className="text-[var(--text-xs)] text-slate-400">
                      {new Date(scan.time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <button
                    onClick={() => handleUndo(scan)}
                    className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[var(--text-xs)] text-slate-500 hover:bg-slate-100 touch-target flex-shrink-0"
                  >
                    <ArrowCounterClockwise size={12} />
                    Undo
                  </button>
                </div>
              )
            })}
            {maxVisible && recentScans.length > maxVisible && (
              <button
                onClick={() => setShowAllScans(!showAllScans)}
                className="w-full py-2 text-[var(--text-xs)] text-slate-400 hover:text-slate-600 underline underline-offset-2 text-center"
              >
                {showAllScans ? 'Show less' : `Show ${recentScans.length - maxVisible} more`}
              </button>
            )}
          </>
        )}
      </Card>
    )
  }

  function resetToPending(item: StockItem) {
    restoreItemState(item.id, {
      custodyLocation: 'at_client',
      custodyHistory: [],
      lastScannedAt: null,
      lastScannedBy: null,
    })
    setConfirmRemoveId(null)
  }

  const itemTable = (items: StockItem[], emptyMsg = 'No items at this location') => (
    <div>
      <div className="flex px-4 py-1.5 bg-slate-50 border-b border-[var(--color-border)] text-[var(--text-xs)] font-semibold text-slate-400 uppercase tracking-wide">
        <span className="w-7">#</span>
        <span className="w-32">Style</span>
        <span className="flex-1">Description</span>
        <span className="w-14 text-right">Look</span>
      </div>
      <div className="overflow-y-auto max-h-[50vh] lg:max-h-none">
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-[var(--text-sm)] text-slate-400">{emptyMsg}</div>
        ) : items.map((item, i) => (
          <div key={item.id}>
            <div
              className={`flex items-center px-4 py-2 border-b border-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
            >
              <span className="w-7 text-[var(--text-xs)] text-slate-300">{i + 1}</span>
              <span className="w-32 text-[var(--text-sm)] font-semibold text-slate-900 truncate">{item.styleNumber}</span>
              <span className="flex-1 text-[var(--text-xs)] text-slate-500 truncate">{item.description || '—'}</span>
              <span className="w-14 text-right text-[var(--text-xs)] text-slate-400">
                {item.looks.length > 0 ? item.looks.map(l => `L${l}`).join(', ') : '—'}
              </span>
              <div className="flex gap-1 ml-2 flex-shrink-0">
                {item.custodyLocation === 'at_client' && (
                  <button
                    onClick={() => resetToPending(item)}
                    title="Reset to pending (undo scan, keep in shoot)"
                    className="px-1.5 py-0.5 rounded text-[var(--text-xs)] text-slate-400 hover:text-[var(--color-warning)] hover:bg-amber-50 transition-colors"
                  >
                    ↩
                  </button>
                )}
                {confirmRemoveId === item.id ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => { removeItemFromShoot(item.id, selectedShootId); setConfirmRemoveId(null) }}
                      className="px-1.5 py-0.5 rounded text-[var(--text-xs)] bg-[var(--color-danger)] text-white"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmRemoveId(null)}
                      className="px-1.5 py-0.5 rounded text-[var(--text-xs)] text-slate-400 hover:bg-slate-100"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmRemoveId(item.id)}
                    title="Remove from shoot"
                    className="px-1.5 py-0.5 rounded text-[var(--text-xs)] text-slate-400 hover:text-[var(--color-danger)] hover:bg-red-50 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="lg:flex lg:h-full">

      {/* ── Scan panel (left on desktop, full on phone/iPad) ── */}
      <div className="lg:w-[500px] lg:flex-shrink-0 lg:flex lg:flex-col bg-[var(--color-surface-muted)]">

        {/* TABLET+: Stats pills — pinned, never scrolls away */}
        <div className="hidden md:block flex-shrink-0 px-4 lg:px-6 pt-4 lg:pt-6 pb-4">
          <div className="flex bg-white rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
            {statRows.map((pill, idx) => {
              const style = LOCATION_STYLE[pill.loc]
              const isActive = activeStatView === pill.loc
              return (
                <div key={pill.loc} className="flex flex-1">
                  {idx > 0 && <div className="w-px bg-[var(--color-border)]" />}
                  <button
                    onClick={() => setActiveStatView(pill.loc)}
                    className={`flex-1 text-center px-2 py-3 transition-colors ${isActive ? style.activeBg : 'bg-transparent hover:bg-slate-50'}`}
                  >
                    <div className={`text-2xl font-bold tabular-nums ${style.text}`}>{pill.count}</div>
                    <div className={`text-[var(--text-xs)] ${isActive ? style.text : 'text-slate-500'} ${isActive ? 'font-semibold' : ''}`}>
                      {pill.label}
                    </div>
                    {isActive && <div className={`w-6 h-0.5 ${style.bg} mx-auto mt-1 rounded-full`} />}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Scrollable body — pills stay pinned above this */}
        <div className="flex-1 min-h-0 lg:overflow-y-auto px-4 lg:px-6 pb-4 lg:pb-6 pt-4 md:pt-0 flex flex-col gap-4">

        {/* PHONE: Sticky header */}
        <div className="md:hidden sticky top-0 z-10 -mx-4 px-4 py-3 bg-[var(--color-surface-muted)] border-b border-[var(--color-border)] flex items-center justify-between gap-3">
          <span className="text-[var(--text-base)] font-semibold text-slate-900 truncate flex-1">
            {selectedShoot?.name ?? 'No shoot selected'}
          </span>
          <button
            onClick={() => setSheetOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-warning)]/10 text-[var(--color-warning)] text-[var(--text-xs)] font-semibold touch-target flex-shrink-0"
          >
            <Package size={14} />
            {atClientCount} At Client
          </button>
        </div>

        {/* TABLET+: Controls + scan card */}
        <Card className={`hidden md:block ${stylingMode ? 'border-amber-400' : ''}`}>
          <p className="text-[var(--text-lg)] font-semibold text-slate-900 text-center mb-4">Scan In</p>
          {settingsFields}

          <div className="flex items-center gap-2 mt-3 mb-4">
            <Button
              variant="secondary" size="sm"
              className={`flex-1 ${stylingMode ? 'border-amber-400 bg-amber-50 text-amber-700' : ''}`}
              onClick={() => setStylingMode(!stylingMode)}
            >
              {stylingMode ? '✦ Styling Mode ON' : 'Enter Styling Mode'}
            </Button>
            {stylingMode && (
              <Button variant="primary" size="sm" className="bg-amber-500 hover:bg-amber-600" onClick={() => setStylingMode(false)}>
                EXIT
              </Button>
            )}
          </div>

          <hr className="border-[var(--color-border)] mb-4" />
          {scanField}
        </Card>

        {/* PHONE: Collapsible settings */}
        <div className="md:hidden">
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-[var(--radius-lg)] border border-[var(--color-border)] text-[var(--text-sm)] font-medium text-slate-700 touch-target"
          >
            <span className="flex items-center gap-2">
              <Gear size={16} />
              Settings
            </span>
            <span className="text-slate-400 text-[var(--text-xs)]">{settingsOpen ? '▲' : '▼'}</span>
          </button>
          {settingsOpen && (
            <Card className="mt-2">
              {settingsFields}
              <div className="flex items-center gap-2 mt-3">
                <Button
                  variant="secondary" size="sm"
                  className={`flex-1 ${stylingMode ? 'border-amber-400 bg-amber-50 text-amber-700' : ''}`}
                  onClick={() => setStylingMode(!stylingMode)}
                >
                  {stylingMode ? '✦ Styling Mode ON' : 'Enter Styling Mode'}
                </Button>
                {stylingMode && (
                  <Button variant="primary" size="sm" className="bg-amber-500" onClick={() => setStylingMode(false)}>
                    EXIT
                  </Button>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* PHONE: Scan card (always visible) */}
        <Card className="md:hidden">
          {scanField}
        </Card>

        {feedbackBanner}
        {pendingActions}

        <div className="md:hidden">
          {recentScansList(showAllScans ? undefined : 3)}
        </div>
        <div className="hidden md:block">
          {recentScansList()}
        </div>

        </div>{/* end scrollable body */}
      </div>

      {/* ── Desktop: right reference panel ── */}
      <div className="hidden lg:flex flex-col flex-1 border-l border-[var(--color-border)] bg-white min-w-0">
        <div className="px-4 py-3 bg-slate-50 border-b border-[var(--color-border)] flex items-center gap-2 flex-shrink-0">
          <span className={`text-[var(--text-sm)] font-bold ${LOCATION_STYLE[activeStatView].text}`}>
            {locationLabel(activeStatView)}
          </span>
          <span className={`${LOCATION_STYLE[activeStatView].bg} text-white text-[var(--text-xs)] font-bold px-2 py-0.5 rounded-full`}>
            {panelItems.length}
          </span>
          <span className="flex-1" />
          <span className="text-[var(--text-xs)] text-slate-400">{selectedShoot?.name ?? 'No shoot selected'}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {itemTable(panelItems)}
        </div>
      </div>

      {/* ── iPad portrait: reference list below scan panel ── */}
      <div className="hidden md:block lg:hidden px-4 pb-4">
        <Card padding="sm">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
            <span className={`text-[var(--text-sm)] font-bold ${LOCATION_STYLE[activeStatView].text}`}>
              {locationLabel(activeStatView)}
            </span>
            <span className={`${LOCATION_STYLE[activeStatView].bg} text-white text-[var(--text-xs)] font-bold px-2 py-0.5 rounded-full`}>
              {panelItems.length}
            </span>
            <span className="flex-1" />
            <span className="text-[var(--text-xs)] text-slate-400">{selectedShoot?.name ?? ''}</span>
          </div>
          {itemTable(panelItems)}
        </Card>
      </div>

      {/* ── Phone: At-Client bottom sheet ── */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-200 md:hidden ${sheetOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setSheetOpen(false)}
      />
      <div
        className={`fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl h-[70vh] flex flex-col transition-transform duration-200 md:hidden ${sheetOpen ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-base)] font-semibold text-slate-900">At Client</span>
            <span className="bg-[var(--color-warning)] text-white text-[var(--text-xs)] font-bold px-2 py-0.5 rounded-full">
              {atClientCount}
            </span>
          </div>
          <button
            onClick={() => setSheetOpen(false)}
            className="p-2 rounded-[var(--radius-md)] hover:bg-slate-100 touch-target"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {itemTable(atClientItems, 'No items at client yet')}
        </div>
      </div>

      {showCamera && (
        <CameraScanner onScan={handleCameraScan} onClose={() => setShowCamera(false)} />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[var(--text-xs)] font-semibold text-slate-500 w-16 flex-shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}
