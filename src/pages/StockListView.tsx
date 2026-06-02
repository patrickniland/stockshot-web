// StockShot — Stock List View

import { useState } from 'react'
import {
  ClipboardText, MagnifyingGlass, Package, Truck, Storefront,
  Archive, DownloadSimple, FilePdf,
} from '@phosphor-icons/react'
import useAppStore from '../store/useAppStore'
import { useNavSync } from '../hooks/useNavSync'
import { StockItem, CustodyLocation, ShotStatus } from '../types'
import { exportStockListCSV, exportDetailedStockListCSV } from '../lib/csvExport'
import { exportStockListPDF } from '../lib/pdfExporter'
import QRCode from '../components/QRCode'
import ShootPicker from '../components/ShootPicker'
import { Button } from '../components/ui/Button'

// ── Token-based custody config ────────────────────────────────────────────────

const CUSTODY_LABEL: Record<CustodyLocation, string> = {
  at_client: 'At Client', in_transit: 'In Transit', at_studio: 'At Studio',
}

const CUSTODY_PILL_CLS: Record<CustodyLocation, string> = {
  at_client:  'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
  in_transit: 'bg-[var(--color-info)]/10 text-[var(--color-info)]',
  at_studio:  'bg-[var(--color-success)]/10 text-[var(--color-success)]',
}

const CUSTODY_TEXT_CLS: Record<CustodyLocation, string> = {
  at_client:  'text-[var(--color-warning)]',
  in_transit: 'text-[var(--color-info)]',
  at_studio:  'text-[var(--color-success)]',
}

const SHOT_CLS: Record<ShotStatus, string> = {
  notShot:     'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
  shot:        'bg-[var(--color-accent)]/10 text-[var(--color-accent)]',
  notRequired: 'bg-slate-100 text-slate-400',
}

function CustodyIcon({ loc, size = 11 }: { loc: CustodyLocation; size?: number }) {
  if (loc === 'at_client')  return <Package    size={size} className="inline-block flex-shrink-0" />
  if (loc === 'in_transit') return <Truck      size={size} className="inline-block flex-shrink-0" />
  if (loc === 'at_studio')  return <Storefront size={size} className="inline-block flex-shrink-0" />
  return null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StockListView() {
  const [search, setSearch] = useState('')
  const [custodyFilter, setCustodyFilter] = useState<CustodyLocation | 'all' | 'active' | 'mapped'>('active')
  const [sortAsc, setSortAsc] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [bulkProductType, setBulkProductType] = useState('')
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  const [showMarkStudio, setShowMarkStudio] = useState(false)
  const [bulkOperator, setBulkOperator] = useState('')
  const [moveToShootId, setMoveToShootId] = useState('')

  useNavSync({ onEnter: 'pull', onLeave: 'push' })

  const savedShoots = useAppStore(s => s.savedShoots)
  const activeShootId = useAppStore(s => s.activeShootId)
  const updateItem = useAppStore(s => s.updateItem)
  const bulkAssignProductType = useAppStore(s => s.bulkAssignProductType)
  const clients = useAppStore(s => s.clients)
  const currentOperator = useAppStore(s => s.currentOperator)
  const bulkSetCustody = useAppStore(s => s.bulkSetCustody)
  const moveItemsToShoot = useAppStore(s => s.moveItemsToShoot)
  const restoreItemState = useAppStore(s => s.restoreItemState)
  const removeItemFromShoot = useAppStore(s => s.removeItemFromShoot)

  const activeShoot = savedShoots.find(s => s.id === activeShootId) ?? null
  const allItems = activeShoot?.items ?? []
  const client = clients.find(c => c.id === activeShoot?.clientId) ?? null
  const productTypes = client?.productTypes ?? []

  const moveTargetShoots = savedShoots.filter(s =>
    !s.deletedAt && s.id !== activeShootId && !s.isUnassigned
  ).sort((a, b) => a.name.localeCompare(b.name))

  const filtered = allItems
    .filter(i => {
      const isActive = (i.custodyHistory ?? []).length > 0
      if (custodyFilter === 'mapped' && isActive) return false
      if (custodyFilter === 'active' && !isActive) return false
      if (custodyFilter !== 'all' && custodyFilter !== 'active' && custodyFilter !== 'mapped' && i.custodyLocation !== custodyFilter) return false
      if (custodyFilter !== 'all' && custodyFilter !== 'active' && custodyFilter !== 'mapped' && !isActive) return false
      if (!search) return true
      const q = search.toLowerCase()
      return i.styleNumber.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const cmp = a.styleNumber.localeCompare(b.styleNumber)
      return sortAsc ? cmp : -cmp
    })

  function updateItemField(itemId: string, updates: Partial<StockItem>) {
    if (!activeShoot) return
    updateItem(itemId, updates)
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map(i => i.id)))
  }

  function applyBulkProductType() {
    if (!bulkProductType || selectedIds.size === 0) return
    bulkAssignProductType([...selectedIds], bulkProductType)
    setSelectedIds(new Set())
    setBulkProductType('')
  }

  function applyMarkAtStudio() {
    const op = bulkOperator.trim() || currentOperator
    if (!op) return
    bulkSetCustody([...selectedIds], 'at_studio', op)
    setSelectedIds(new Set())
    setShowMarkStudio(false)
    setBulkOperator('')
  }

  function applyMoveToShoot() {
    if (!moveToShootId || selectedIds.size === 0) return
    moveItemsToShoot([...selectedIds], moveToShootId)
    setSelectedIds(new Set())
    setMoveToShootId('')
  }

  if (!activeShoot) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
        <ClipboardText size={64} weight="duotone" />
        <p className="font-medium text-slate-600">No active shoot</p>
        <p className="text-sm">Import a stock file to get started.</p>
      </div>
    )
  }

  const hasSelection = selectedIds.size > 0
  const selectCls = 'px-2 py-1.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm bg-white text-slate-900 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]'

  return (
    <div className="flex flex-col h-full">

      {/* Toolbar */}
      <div className="px-4 py-2.5 bg-[var(--color-surface-muted)] border-b border-[var(--color-border)] flex items-center gap-2 flex-wrap">
        <span className="text-lg font-bold text-slate-900">Stock List</span>
        {activeShoot.isUnassigned && (
          <span className="text-xs bg-[var(--color-warning)]/10 text-[var(--color-warning)] px-1.5 py-0.5 rounded font-semibold">Unassigned</span>
        )}
        <span className="text-sm text-slate-500">({filtered.length} of {allItems.length})</span>
        <div className="flex-1" />

        <div className="flex items-center gap-1.5 bg-white border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-1.5">
          <MagnifyingGlass size={13} className="text-slate-400 flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="border-none outline-none text-sm w-36 bg-transparent text-slate-900 placeholder:text-slate-400"
          />
        </div>

        <select
          value={custodyFilter}
          onChange={e => setCustodyFilter(e.target.value as CustodyLocation | 'all' | 'active' | 'mapped')}
          className={selectCls}
        >
          <option value="active">Active</option>
          <option value="at_studio">At Studio</option>
          <option value="in_transit">In Transit</option>
          <option value="at_client">At Client</option>
          <option value="mapped">Mapped</option>
          <option value="all">All</option>
        </select>

        <Button variant="secondary" size="sm" onClick={() => setSortAsc(!sortAsc)}>
          {sortAsc ? '↑' : '↓'}
        </Button>
        <Button variant="secondary" size="sm" Icon={DownloadSimple} onClick={() => exportStockListCSV(filtered)}>XLS</Button>
        <Button variant="secondary" size="sm" Icon={DownloadSimple} onClick={() => exportDetailedStockListCSV(filtered)} title="XLS with full custody history">XLS+</Button>
        <Button variant="secondary" size="sm" Icon={FilePdf} onClick={() => exportStockListPDF(filtered)}>PDF</Button>
      </div>

      {/* Bulk action bar */}
      {hasSelection && (
        <div className="px-4 py-2 bg-[var(--color-info)]/10 border-b border-[var(--color-info)]/20 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-[var(--color-info)]">{selectedIds.size} selected</span>

          {productTypes.length > 0 && (
            <>
              <select
                value={bulkProductType}
                onChange={e => setBulkProductType(e.target.value)}
                className={`${selectCls} max-w-[180px]`}
              >
                <option value="">Assign type…</option>
                {productTypes.map(pt => <option key={pt.id} value={pt.name}>{pt.name}</option>)}
              </select>
              <Button variant="secondary" size="sm" disabled={!bulkProductType} onClick={applyBulkProductType}>
                Apply type
              </Button>
            </>
          )}

          {!showMarkStudio ? (
            <Button
              variant="secondary"
              size="sm"
              Icon={Storefront}
              onClick={() => { setShowMarkStudio(true); setBulkOperator(currentOperator) }}
            >
              Mark as at Studio
            </Button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                value={bulkOperator}
                onChange={e => setBulkOperator(e.target.value)}
                placeholder="Operator name…"
                autoFocus
                className="px-2 py-1.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm w-36 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!bulkOperator.trim() && !currentOperator}
                onClick={applyMarkAtStudio}
              >
                Confirm
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowMarkStudio(false)}>✕</Button>
            </div>
          )}

          {moveTargetShoots.length > 0 && (
            <div className="flex items-center gap-1.5">
              <ShootPicker
                shoots={moveTargetShoots}
                value={moveToShootId}
                onChange={setMoveToShootId}
                placeholder="Move to shoot…"
              />
              <Button variant="secondary" size="sm" disabled={!moveToShootId} onClick={applyMoveToShoot}>
                Move
              </Button>
            </div>
          )}

          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => { setSelectedIds(new Set()); setShowMarkStudio(false) }}>
            Clear
          </Button>
        </div>
      )}

      {/* Column headers */}
      <div className="flex px-4 py-2 bg-[var(--color-surface-muted)] border-b border-[var(--color-border)] text-xs font-semibold text-slate-500 items-center gap-2">
        <input
          type="checkbox"
          checked={selectedIds.size === filtered.length && filtered.length > 0}
          onChange={selectAll}
          className="flex-shrink-0"
        />
        <span className="w-7 text-center">#</span>
        <span className="flex-1">Style / SKU</span>
        <span className="w-28">Description</span>
        <span className="w-14">Looks</span>
        <span className="w-24">Type</span>
        <span className="w-28">Custody</span>
        <span className="w-20">Shot</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto bg-white">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No items match.</div>
        ) : filtered.map((item, i) => {
          const isActive = (item.custodyHistory ?? []).length > 0
          return (
            <div key={item.id}>
              <div className={`flex items-center px-4 py-2.5 gap-2 cursor-pointer border-b ${
                expandedId === item.id ? 'border-transparent' : 'border-[var(--color-border)]'
              } ${
                selectedIds.has(item.id) ? 'bg-[var(--color-info)]/5' : i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-surface-muted)]'
              }`}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleSelect(item.id)}
                  onClick={e => e.stopPropagation()}
                  className="flex-shrink-0"
                />

                <span className="w-7 text-center text-xs text-slate-400 flex-shrink-0">{i + 1}</span>

                <div className="flex-1 min-w-0" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                  <div className="text-sm font-medium text-slate-900 overflow-hidden text-ellipsis whitespace-nowrap">{item.styleNumber}</div>
                  <div className="text-xs text-slate-400 font-mono overflow-hidden text-ellipsis whitespace-nowrap">{item.sku}</div>
                </div>

                <div
                  className="w-28 text-xs text-slate-500 overflow-hidden text-ellipsis whitespace-nowrap"
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                >
                  {item.description || '—'}
                </div>

                {/* Looks */}
                <div className="w-14 flex flex-wrap gap-0.5">
                  {item.looks.map(l => (
                    <span key={l} className="text-[9px] font-bold bg-[var(--color-accent)]/10 text-[var(--color-accent)] px-1 py-0.5 rounded">
                      L{l}
                    </span>
                  ))}
                </div>

                {/* Product type */}
                <div className="w-24">
                  {productTypes.length > 0 ? (
                    <select
                      value={item.productType ?? ''}
                      onChange={e => {
                        const pt = productTypes.find(p => p.name === e.target.value)
                        const requiredAngles = pt?.requiredAngles.map(a => a.name) ?? []
                        updateItemField(item.id, { productType: e.target.value || null, requiredAngles })
                      }}
                      className="w-full px-1 py-1 border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs bg-white text-slate-900 cursor-pointer"
                    >
                      <option value="">— none —</option>
                      {productTypes.map(pt => <option key={pt.id} value={pt.name}>{pt.name}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </div>

                {/* Custody */}
                <div className="w-28">
                  {isActive ? (
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${CUSTODY_PILL_CLS[item.custodyLocation]}`}>
                      <CustodyIcon loc={item.custodyLocation} />
                      {CUSTODY_LABEL[item.custodyLocation]}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-400">
                      <Archive size={11} className="inline-block flex-shrink-0" />
                      Mapped
                    </span>
                  )}
                </div>

                {/* Shot status */}
                <div className="w-20">
                  <select
                    value={item.shotStatus}
                    onChange={e => {
                      const status = e.target.value as ShotStatus
                      const now = new Date().toISOString()
                      updateItemField(item.id, {
                        shotStatus: status,
                        shotAt: status === 'shot' ? now : null,
                        completedAngles: status === 'shot' ? item.requiredAngles : [],
                      })
                    }}
                    className={`w-full text-xs font-semibold px-1.5 py-1 rounded-full border border-[var(--color-border)] cursor-pointer appearance-auto ${SHOT_CLS[item.shotStatus] ?? 'bg-slate-100 text-slate-400'}`}
                  >
                    <option value="notShot">Not Shot</option>
                    <option value="shot">Shot</option>
                    <option value="notRequired">N/A</option>
                  </select>
                </div>
              </div>

              {/* Expanded panel */}
              {expandedId === item.id && (
                <div className="px-4 pl-16 pb-4 pt-3 bg-slate-50 border-b border-[var(--color-border)] flex flex-col gap-3">

                  {/* Row 1: QR + custody history */}
                  <div className="flex gap-5 flex-wrap">
                    <div className="flex flex-col items-center gap-1">
                      <QRCode value={item.qrCodeValue} size={80} />
                      <div className="text-[10px] text-slate-400 font-mono max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap">
                        {item.qrCodeValue}
                      </div>
                    </div>

                    <div className="flex-1 min-w-[200px]">
                      <div className="text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wide">
                        Custody History
                      </div>
                      {item.custodyHistory.length === 0 ? (
                        <p className="text-xs text-slate-300">No custody events recorded.</p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {item.custodyHistory.map((event, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-xs">
                              <span className="text-slate-300 whitespace-nowrap flex-shrink-0">
                                {new Date(event.timestamp).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                                {' '}
                                {new Date(event.timestamp).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className={`font-semibold flex items-center gap-1 ${CUSTODY_TEXT_CLS[event.location] ?? 'text-slate-600'}`}>
                                <CustodyIcon loc={event.location} />
                                {CUSTODY_LABEL[event.location]}
                              </span>
                              {event.notes && <span className="text-slate-400">— {event.notes}</span>}
                              {event.operator && <span className="text-slate-300">({event.operator})</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {item.notes && (
                        <div className="mt-2 text-xs text-slate-500">{item.notes}</div>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Release actions */}
                  {activeShootId && (
                    <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border)] flex-wrap">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex-shrink-0">
                        Release:
                      </span>
                      {item.custodyLocation === 'at_client' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            restoreItemState(item.id, {
                              custodyLocation: 'at_client',
                              custodyHistory: [],
                              lastScannedAt: null,
                              lastScannedBy: null,
                            })
                            setExpandedId(null)
                          }}
                        >
                          ↩ Reset to pending
                        </Button>
                      )}
                      {confirmRemoveId === item.id ? (
                        <>
                          <span className="text-xs text-slate-500">Sure?</span>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => { removeItemFromShoot(item.id, activeShootId); setConfirmRemoveId(null); setExpandedId(null) }}
                          >
                            Yes, remove
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmRemoveId(null)}>Cancel</Button>
                        </>
                      ) : (
                        <Button variant="danger" size="sm" onClick={() => setConfirmRemoveId(item.id)}>
                          Remove from shoot
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
