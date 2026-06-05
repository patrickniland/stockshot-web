import { useState, useRef, useEffect } from 'react'
import { Camera, X, ArrowCounterClockwise, Gear, Package, CircleNotch, ScanSmiley } from '@phosphor-icons/react'
import useAppStore from '../store/useAppStore'
import { useNavSync } from '../hooks/useNavSync'
import { useToast } from '../hooks/useToast'
import { StockItem, CustodyLocation } from '../types'
import CameraScanner from '../components/CameraScanner'
import OperatorPinEntry from '../components/OperatorPinEntry'
import ShootPicker from '../components/ShootPicker'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'

// ── Types ─────────────────────────────────────────────────────────────────────

type OutToKey = 'in_transit' | 'at_client'

const OUT_TO_OPTIONS: { key: OutToKey; label: string; location: CustodyLocation }[] = [
  { key: 'in_transit', label: 'In Transit',       location: 'in_transit' },
  { key: 'at_client',  label: 'Return to Client', location: 'at_client' },
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScanOutView() {
  useNavSync({ onEnter: 'pull' })

  const scanInputRef = useRef<HTMLInputElement>(null)
  const [scanInput, setScanInput] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const [outToKey, setOutToKey] = useState<OutToKey>('in_transit')
  const [recentScans, setRecentScans] = useState<RecentScan[]>([])
  const [activeStatView, setActiveStatView] = useState<CustodyLocation>('at_studio')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [showAllScans, setShowAllScans] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [flashState, setFlashState] = useState<'success' | 'error' | null>(null)

  const { addToast } = useToast()

  const savedShoots = useAppStore(s => s.savedShoots)
  const activeShootId = useAppStore(s => s.activeShootId)
  const currentOperator = useAppStore(s => s.currentOperator)
  const currentOperatorIsClient = useAppStore(s => s.currentOperatorIsClient)
  const setCustody = useAppStore(s => s.setCustody)
  const restoreItemState = useAppStore(s => s.restoreItemState)
  const setLastScanFeedback = useAppStore(s => s.setLastScanFeedback)
  const lastScanFeedback = useAppStore(s => s.lastScanFeedback)

  const activeShoots = savedShoots.filter(s => !s.deletedAt)
  const [selectedShootId, setSelectedShootId] = useState<string>(activeShootId ?? '')

  useEffect(() => {
    setLastScanFeedback(null)
    scanInputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (currentOperatorIsClient) {
      const allowed = OUT_TO_OPTIONS.filter(o => o.location !== 'at_studio')
      if (!allowed.some(o => o.key === outToKey)) setOutToKey(allowed[0].key)
    }
  }, [currentOperatorIsClient])

  const canScan = !!currentOperator.trim()
  const selectedOption = OUT_TO_OPTIONS.find(o => o.key === outToKey) ?? OUT_TO_OPTIONS[0]

  const allItems = activeShoots.flatMap(s => s.items)
  const shootItems = selectedShootId
    ? (activeShoots.find(s => s.id === selectedShootId)?.items ?? [])
    : allItems

  const atStudioCount  = allItems.filter(i => i.custodyLocation === 'at_studio').length
  const inTransitCount = allItems.filter(i => i.custodyLocation === 'in_transit').length
  const atClientCount  = allItems.filter(i => i.custodyLocation === 'at_client' && (i.custodyHistory ?? []).length > 0).length

  const panelItems = shootItems.filter(i => {
    if (i.custodyLocation !== activeStatView) return false
    if (activeStatView === 'at_client') return (i.custodyHistory ?? []).length > 0
    return true
  })

  const atClientItems = allItems.filter(i =>
    i.custodyLocation === 'at_client' && (i.custodyHistory ?? []).length > 0
  )

  // ── Feedback helpers ─────────────────────────────────────────────────────────

  function triggerSuccess() {
    setFlashState('success')
    setTimeout(() => setFlashState(null), 350)
    try { navigator.vibrate(50) } catch {}
  }

  function triggerError(message: string) {
    setFlashState('error')
    setTimeout(() => setFlashState(null), 350)
    try { navigator.vibrate([100, 50, 100]) } catch {}
    addToast('error', message)
  }

  // ── Scan logic ──────────────────────────────────────────────────────────────

  function handleScan(barcode: string) {
    const raw = barcode.trim()
    if (!raw || !canScan) return

    let foundItem: StockItem | null = null
    let foundShootId: string | null = null
    for (const shoot of savedShoots) {
      const match = shoot.items.find(i => matchesBarcode(i, raw))
      if (match) { foundItem = match; foundShootId = shoot.id; break }
    }

    if (!foundItem) {
      triggerError(`Item not found — ${raw}`)
      setLastScanFeedback({ id: Date.now().toString(), type: 'notFound', message: 'Item not found', scannedValue: raw })
      return
    }

    const { location: targetLocation } = selectedOption
    const hasHistory = (foundItem.custodyHistory ?? []).length > 0
    if (foundItem.custodyLocation === targetLocation && hasHistory) {
      triggerError(`Already ${locationLabel(targetLocation)} — ${foundItem.styleNumber || foundItem.qrCodeValue}`)
      setLastScanFeedback({
        id: Date.now().toString(),
        type: 'alreadyAtLocation',
        message: `Already ${locationLabel(targetLocation)}`,
        scannedValue: foundItem.styleNumber || foundItem.qrCodeValue,
      })
      return
    }

    const prev = {
      custodyLocation: foundItem.custodyLocation,
      custodyHistory: foundItem.custodyHistory,
      lastScannedAt: foundItem.lastScannedAt,
      lastScannedBy: foundItem.lastScannedBy,
    }

    const now = new Date().toISOString()
    setCustody(foundItem.id, targetLocation, currentOperator, foundShootId ?? undefined)

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
    triggerSuccess()
  }

  function handleUndo(scan: RecentScan) {
    restoreItemState(scan.itemId, scan.prev)
    setRecentScans(p => p.filter(s => s.key !== scan.key))
    setLastScanFeedback({ id: Date.now().toString(), type: 'success', message: 'Scan undone', scannedValue: scan.identifier })
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
    { loc: 'in_transit', label: 'In Transit', count: inTransitCount },
    { loc: 'at_client',  label: 'At Client',  count: atClientCount },
  ]

  const settingsFields = (
    <div className="flex flex-col gap-3">
      <ControlRow label="Operator">
        <OperatorPinEntry />
      </ControlRow>

      {/* Shoot */}
      <ControlRow label="Shoot">
        <ShootPicker shoots={activeShoots} value={selectedShootId} onChange={setSelectedShootId} placeholder="All shoots" />
      </ControlRow>

      {/* Out To */}
      <ControlRow label="Out To">
        <div className="flex flex-wrap gap-1.5">
          {OUT_TO_OPTIONS.filter(o => !(currentOperatorIsClient && o.location === 'at_studio')).map(opt => {
            const style = LOCATION_STYLE[opt.location]
            const isActive = outToKey === opt.key
            return (
              <button
                key={opt.key}
                onClick={() => setOutToKey(opt.key)}
                className={[
                  'px-3 py-1.5 rounded-[var(--radius-md)] text-[var(--text-sm)] font-semibold border touch-target transition-colors',
                  isActive
                    ? `${style.activeBg} border-current ${style.text}`
                    : 'border-[var(--color-border)] bg-white text-slate-500 hover:bg-slate-50',
                ].join(' ')}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </ControlRow>
    </div>
  )

  const scanField = (
    <div className="flex flex-col gap-3">
      {!canScan && (
        <p className="text-[var(--text-xs)] text-[var(--color-warning)] text-center font-medium">
          Enter your operator PIN to begin scanning
        </p>
      )}

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
          {scanning ? <CircleNotch size={18} className="animate-spin" /> : 'Scan Out'}
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
      lastScanFeedback.type === 'success'   ? 'bg-[var(--color-info)]'
        : lastScanFeedback.type === 'notFound' ? 'bg-[var(--color-danger)]'
        : 'bg-[var(--color-warning)]',
    ].join(' ')}>
      <div>
        <div className="text-white font-semibold text-[var(--text-sm)]">{lastScanFeedback.message}</div>
        <div className="text-white/80 text-[var(--text-xs)] font-mono">{lastScanFeedback.scannedValue}</div>
      </div>
    </div>
  )

  const recentScansList = (maxVisible?: number) => {
    const displayed = maxVisible ? recentScans.slice(0, maxVisible) : recentScans
    return (
      <Card padding="sm" className="overflow-hidden">
        <div className="px-2 py-1.5 mb-1 text-[var(--text-xs)] font-semibold text-slate-500 uppercase tracking-wide">
          Recent scans this session
        </div>
        {recentScans.length === 0 ? (
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
                    <div className={`text-[var(--text-xs)] ${style.text}`}>{scan.outToLabel}</div>
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
          <div
            key={item.id}
            className={`flex items-center px-4 py-2 border-b border-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
          >
            <span className="w-7 text-[var(--text-xs)] text-slate-300">{i + 1}</span>
            <span className="w-32 text-[var(--text-sm)] font-semibold text-slate-900 truncate">{item.styleNumber}</span>
            <span className="flex-1 text-[var(--text-xs)] text-slate-500 truncate">{item.description || '—'}</span>
            <span className="w-14 text-right text-[var(--text-xs)] text-slate-400">
              {item.looks.length > 0 ? item.looks.map(l => `L${l}`).join(', ') : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="lg:flex lg:h-full">

      {/* ── Scan panel (left on desktop, full on phone/iPad) ── */}
      <div className="lg:w-[500px] lg:flex-shrink-0 lg:overflow-y-auto p-4 lg:p-6 bg-[var(--color-surface-muted)] flex flex-col gap-4">

        {/* PHONE: Sticky header */}
        <div className="md:hidden sticky top-0 z-10 -mx-4 px-4 py-3 bg-[var(--color-surface-muted)] border-b border-[var(--color-border)] flex items-center justify-between gap-3">
          <span className="text-[var(--text-base)] font-semibold text-slate-900 truncate flex-1">
            {selectedShootId
              ? activeShoots.find(s => s.id === selectedShootId)?.name ?? 'Scan Out'
              : 'All Shoots'}
          </span>
          <button
            onClick={() => setSheetOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-warning)]/10 text-[var(--color-warning)] text-[var(--text-xs)] font-semibold touch-target flex-shrink-0"
          >
            <Package size={14} />
            {atClientCount} At Client
          </button>
        </div>

        {/* TABLET+: Stats pills */}
        <div className="hidden md:flex bg-white rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
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

        {/* TABLET+: Controls + scan card */}
        <Card className="hidden md:block">
          <p className="text-[var(--text-lg)] font-semibold text-slate-900 text-center mb-4">Scan Out</p>
          {settingsFields}
          <hr className="border-[var(--color-border)] my-4" />
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
            </Card>
          )}
        </div>

        {/* PHONE: Scan card (always visible) */}
        <Card className="md:hidden">
          {scanField}
        </Card>

        {/* Feedback banner */}
        {feedbackBanner}

        {/* Recent scans */}
        <div className="md:hidden">
          {recentScansList(showAllScans ? undefined : 3)}
        </div>
        <div className="hidden md:block">
          {recentScansList()}
        </div>
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
          <span className="text-[var(--text-xs)] text-slate-400">
            {selectedShootId ? activeShoots.find(s => s.id === selectedShootId)?.name : 'All shoots'}
          </span>
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
            <span className="text-[var(--text-xs)] text-slate-400">
              {selectedShootId ? activeShoots.find(s => s.id === selectedShootId)?.name : 'All shoots'}
            </span>
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
