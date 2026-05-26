// StockShot — Stock List View

import { useState } from 'react'
import useAppStore from '../store/useAppStore'
import { useNavSync } from '../hooks/useNavSync'
import { StockItem, CustodyLocation, ShotStatus } from '../types'
import { exportStockListCSV, exportDetailedStockListCSV } from '../lib/csvExport'
import { exportStockListPDF } from '../lib/pdfExporter'
import QRCode from '../components/QRCode'
import ShootPicker from '../components/ShootPicker'

// ── Custody styling ───────────────────────────────────────────────────────────

const CUSTODY_LABEL: Record<CustodyLocation, string> = {
  at_client:  'At Client',
  in_transit: 'In Transit',
  at_studio:  'At Studio',
}
const CUSTODY_COLOR: Record<CustodyLocation, string> = {
  at_client:  '#E65100',
  in_transit: '#1565C0',
  at_studio:  '#2E7D32',
}
const CUSTODY_BG: Record<CustodyLocation, string> = {
  at_client:  '#FFF3E0',
  in_transit: '#E3F2FD',
  at_studio:  '#E8F5E9',
}
const CUSTODY_ICON: Record<CustodyLocation, string> = {
  at_client: '📦', in_transit: '🚚', at_studio: '🏠',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StockListView() {
  const [search, setSearch] = useState('')
  const [custodyFilter, setCustodyFilter] = useState<CustodyLocation | 'all' | 'mapped'>('all')
  const [sortAsc, setSortAsc] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [bulkProductType, setBulkProductType] = useState('')

  // Bulk mark-at-studio
  const [showMarkStudio, setShowMarkStudio] = useState(false)
  const [bulkOperator, setBulkOperator] = useState('')

  // Bulk move-to-shoot
  const [moveToShootId, setMoveToShootId] = useState('')

  useNavSync({ onEnter: 'pull', onLeave: 'push' })

  const savedShoots = useAppStore(s => s.savedShoots)
  const activeShootId = useAppStore(s => s.activeShootId)
  const updateItem = useAppStore(s => s.updateItem)
  const clients = useAppStore(s => s.clients)
  const currentOperator = useAppStore(s => s.currentOperator)
  const bulkSetCustody = useAppStore(s => s.bulkSetCustody)
  const moveItemsToShoot = useAppStore(s => s.moveItemsToShoot)

  const activeShoot = savedShoots.find(s => s.id === activeShootId) ?? null
  const allItems = activeShoot?.items ?? []
  const client = clients.find(c => c.id === activeShoot?.clientId) ?? null
  const productTypes = client?.productTypes ?? []

  // Shoots available for "Move to" (exclude current shoot and its own Unassigned)
  const moveTargetShoots = savedShoots.filter(s =>
    !s.deletedAt && s.id !== activeShootId && !s.isUnassigned
  ).sort((a, b) => a.name.localeCompare(b.name))

  const filtered = allItems
    .filter(i => {
      const isActive = (i.custodyHistory ?? []).length > 0
      if (custodyFilter === 'mapped' && isActive) return false
      if (custodyFilter !== 'all' && custodyFilter !== 'mapped' && i.custodyLocation !== custodyFilter) return false
      if (custodyFilter !== 'all' && custodyFilter !== 'mapped' && !isActive) return false
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
    if (!bulkProductType || !activeShoot || selectedIds.size === 0) return
    const pt = productTypes.find(p => p.name === bulkProductType)
    const requiredAngles = pt?.requiredAngles.map(a => a.name) ?? []
    updateShootItems(activeShoot.items.map(i =>
      selectedIds.has(i.id) ? { ...i, productType: bulkProductType, requiredAngles, completedAngles: [] } : i
    ))
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
      <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
        <p style={{ fontSize: '40px', marginBottom: '12px' }}>📋</p>
        <p style={{ fontWeight: 500 }}>No active shoot</p>
        <p style={{ fontSize: '12px' }}>Import a stock file to get started.</p>
      </div>
    )
  }

  const hasSelection = selectedIds.size > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Toolbar */}
      <div style={{ padding: '10px 16px', background: '#F5F5F5', borderBottom: '1px solid #E0E0E0', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color: '#111' }}>Stock List</span>
        {activeShoot.isUnassigned && (
          <span style={{ fontSize: '11px', background: '#FFF3E0', color: '#E65100', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Unassigned</span>
        )}
        <span style={{ fontSize: '13px', color: '#666' }}>({filtered.length} of {allItems.length})</span>
        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #E0E0E0', borderRadius: '7px', padding: '5px 10px' }}>
          <span style={{ fontSize: '12px', color: '#888' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search..." style={{ border: 'none', outline: 'none', fontSize: '12px', width: '140px' }} />
        </div>

        {/* Custody filter */}
        <select value={custodyFilter} onChange={e => setCustodyFilter(e.target.value as CustodyLocation | 'all' | 'mapped')}
          style={{ padding: '6px 8px', border: '1px solid #E0E0E0', borderRadius: '7px', fontSize: '12px' }}>
          <option value="all">All</option>
          <option value="mapped">Mapped (not active)</option>
          <option value="at_client">At Client</option>
          <option value="in_transit">In Transit</option>
          <option value="at_studio">At Studio</option>
        </select>

        <button onClick={() => setSortAsc(!sortAsc)} style={{ padding: '6px 10px', background: '#E0E0E0', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
          {sortAsc ? '↑' : '↓'}
        </button>
        <button onClick={() => exportStockListCSV(filtered)} style={{ padding: '6px 10px', background: '#F5F5F5', border: '1px solid #E0E0E0', color: '#444', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}>XLS</button>
        <button onClick={() => exportDetailedStockListCSV(filtered)} style={{ padding: '6px 10px', background: '#F5F5F5', border: '1px solid #E0E0E0', color: '#444', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }} title="XLS with full custody history">XLS+</button>
        <button onClick={() => exportStockListPDF(filtered)} style={{ padding: '6px 10px', background: '#424242', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}>PDF</button>
      </div>

      {/* Bulk action bar */}
      {hasSelection && (
        <div style={{ padding: '8px 16px', background: '#E3F2FD', borderBottom: '1px solid #BBDEFB', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#1565C0' }}>{selectedIds.size} selected</span>

          {/* Bulk product type */}
          {productTypes.length > 0 && (
            <>
              <select value={bulkProductType} onChange={e => setBulkProductType(e.target.value)}
                style={{ padding: '5px 8px', border: '1px solid #BBDEFB', borderRadius: '6px', fontSize: '12px', maxWidth: '180px' }}>
                <option value="">Assign type...</option>
                {productTypes.map(pt => <option key={pt.id} value={pt.name}>{pt.name}</option>)}
              </select>
              <button onClick={applyBulkProductType} disabled={!bulkProductType} style={{
                padding: '5px 12px', background: bulkProductType ? '#1565C0' : '#E0E0E0',
                color: bulkProductType ? '#fff' : '#999', border: 'none', borderRadius: '6px',
                fontSize: '12px', cursor: bulkProductType ? 'pointer' : 'default', fontWeight: 500,
              }}>Apply type</button>
            </>
          )}

          {/* Mark as at Studio */}
          {!showMarkStudio ? (
            <button onClick={() => { setShowMarkStudio(true); setBulkOperator(currentOperator) }} style={{
              padding: '5px 12px', background: '#2E7D32', color: '#fff', border: 'none',
              borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
            }}>
              🏠 Mark as at Studio
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                value={bulkOperator}
                onChange={e => setBulkOperator(e.target.value)}
                placeholder="Operator name..."
                autoFocus
                style={{ padding: '4px 8px', border: '1px solid #A5D6A7', borderRadius: '5px', fontSize: '12px', width: '130px', outline: 'none' }}
              />
              <button onClick={applyMarkAtStudio} disabled={!bulkOperator.trim() && !currentOperator} style={{
                padding: '5px 10px', background: (bulkOperator.trim() || currentOperator) ? '#2E7D32' : '#E0E0E0',
                color: (bulkOperator.trim() || currentOperator) ? '#fff' : '#999',
                border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
              }}>Confirm</button>
              <button onClick={() => setShowMarkStudio(false)} style={{
                padding: '5px 8px', background: 'none', border: 'none', fontSize: '11px', color: '#666', cursor: 'pointer',
              }}>✕</button>
            </div>
          )}

          {/* Move to shoot (available for all shoots) */}
          {moveTargetShoots.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShootPicker
                shoots={moveTargetShoots}
                value={moveToShootId}
                onChange={setMoveToShootId}
                placeholder="Move to shoot..."
                style={{ padding: '5px 8px', fontSize: '12px', maxWidth: '180px', border: '1px solid #BBDEFB' }}
              />
              <button onClick={applyMoveToShoot} disabled={!moveToShootId} style={{
                padding: '5px 12px', background: moveToShootId ? '#7B1FA2' : '#E0E0E0',
                color: moveToShootId ? '#fff' : '#999', border: 'none', borderRadius: '6px',
                fontSize: '12px', cursor: moveToShootId ? 'pointer' : 'default', fontWeight: 500,
              }}>Move</button>
            </div>
          )}

          <button onClick={() => { setSelectedIds(new Set()); setShowMarkStudio(false) }}
            style={{ padding: '5px 8px', background: 'none', border: 'none', fontSize: '12px', color: '#666', cursor: 'pointer', marginLeft: 'auto' }}>
            Clear
          </button>
        </div>
      )}

      {/* Column headers */}
      <div style={{ display: 'flex', padding: '7px 16px', background: '#F5F5F5', borderBottom: '1px solid #E0E0E0', fontSize: '11px', fontWeight: 600, color: '#666', alignItems: 'center', gap: '8px' }}>
        <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0}
          onChange={selectAll} style={{ flexShrink: 0 }} />
        <span style={{ width: '28px', textAlign: 'center' }}>#</span>
        <span style={{ flex: 1 }}>Style / SKU</span>
        <span style={{ width: '120px' }}>Description</span>
        <span style={{ width: '60px' }}>Looks</span>
        <span style={{ width: '110px' }}>Type</span>
        <span style={{ width: '120px' }}>Custody</span>
        <span style={{ width: '90px' }}>Shot</span>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#888', fontSize: '13px' }}>No items match.</div>
        ) : filtered.map((item, i) => (
          <div key={item.id}>
            <div style={{
              display: 'flex', alignItems: 'center', padding: '8px 16px', gap: '8px',
              borderBottom: expandedId === item.id ? 'none' : '1px solid #F5F5F5',
              background: selectedIds.has(item.id) ? '#EEF6FF' : i % 2 === 0 ? '#fff' : '#FAFAFA',
              cursor: 'pointer',
            }}>
              <input type="checkbox" checked={selectedIds.has(item.id)}
                onChange={() => toggleSelect(item.id)}
                onClick={e => e.stopPropagation()}
                style={{ flexShrink: 0 }} />

              <span style={{ width: '28px', textAlign: 'center', fontSize: '11px', color: '#999', flexShrink: 0 }}>{i + 1}</span>

              <div style={{ flex: 1, minWidth: 0 }} onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.styleNumber}</div>
                <div style={{ fontSize: '10px', color: '#888', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sku}</div>
              </div>

              <div style={{ width: '120px', fontSize: '11px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                {item.description || '—'}
              </div>

              {/* Looks */}
              <div style={{ width: '60px', display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                {item.looks.map(l => (
                  <span key={l} style={{ fontSize: '9px', fontWeight: 700, background: '#EDE9FE', color: '#7B1FA2', padding: '1px 4px', borderRadius: '3px' }}>
                    L{l}
                  </span>
                ))}
              </div>

              {/* Product type */}
              <div style={{ width: '110px' }}>
                {productTypes.length > 0 ? (
                  <select value={item.productType ?? ''} onChange={e => {
                    const pt = productTypes.find(p => p.name === e.target.value)
                    const requiredAngles = pt?.requiredAngles.map(a => a.name) ?? []
                    updateItemField(item.id, { productType: e.target.value || null, requiredAngles })
                  }} style={{ fontSize: '11px', padding: '3px 4px', border: '1px solid #E0E0E0', borderRadius: '5px', width: '100%' }}>
                    <option value="">— none —</option>
                    {productTypes.map(pt => <option key={pt.id} value={pt.name}>{pt.name}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: '11px', color: '#ccc' }}>—</span>
                )}
              </div>

              {/* Custody */}
              {(() => {
                const isActive = (item.custodyHistory ?? []).length > 0
                const bg    = isActive ? CUSTODY_BG[item.custodyLocation]    : '#F5F5F5'
                const color = isActive ? CUSTODY_COLOR[item.custodyLocation] : '#999'
                const icon  = isActive ? CUSTODY_ICON[item.custodyLocation]  : '🗂'
                const label = isActive ? CUSTODY_LABEL[item.custodyLocation] : 'Mapped'
                return (
                  <div style={{ width: '120px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 7px', borderRadius: '99px', background: bg, color, whiteSpace: 'nowrap' }}>
                      {icon} {label}
                    </span>
                  </div>
                )
              })()}

              {/* Shot */}
              <div style={{ width: '90px' }}>
                <select value={item.shotStatus} onChange={e => updateItemField(item.id, { shotStatus: e.target.value as ShotStatus })}
                  style={{
                    fontSize: '11px', fontWeight: 600, padding: '4px 6px', borderRadius: '99px',
                    border: '1px solid #E0E0E0', cursor: 'pointer', appearance: 'auto', width: '100%',
                    background: item.shotStatus === 'shot' ? '#EDE9FE' : item.shotStatus === 'notRequired' ? '#F5F5F5' : '#FFF3E0',
                    color: item.shotStatus === 'shot' ? '#7B1FA2' : item.shotStatus === 'notRequired' ? '#999' : '#E65100',
                  }}>
                  <option value="notShot">Not Shot</option>
                  <option value="shot">Shot</option>
                  <option value="notRequired">N/A</option>
                </select>
              </div>
            </div>

            {/* Expanded panel */}
            {expandedId === item.id && (
              <div style={{ padding: '12px 16px 16px 60px', background: '#F8F8F8', borderBottom: '1px solid #F0F0F0', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                {/* QR Code */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <QRCode value={item.qrCodeValue} size={80} />
                  <div style={{ fontSize: '10px', color: '#888', fontFamily: 'monospace', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.qrCodeValue}
                  </div>
                </div>

                {/* Custody history */}
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#666', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Custody History
                  </div>
                  {item.custodyHistory.length === 0 ? (
                    <p style={{ fontSize: '11px', color: '#aaa' }}>No custody events recorded.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {item.custodyHistory.map((event, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '11px' }}>
                          <span style={{ color: '#aaa', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {new Date(event.timestamp).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                            {' '}
                            {new Date(event.timestamp).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span style={{ color: CUSTODY_COLOR[event.location] ?? '#444', fontWeight: 600 }}>
                            {CUSTODY_ICON[event.location]} {CUSTODY_LABEL[event.location]}
                          </span>
                          {event.notes && <span style={{ color: '#888' }}>— {event.notes}</span>}
                          {event.operator && <span style={{ color: '#aaa' }}>({event.operator})</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {item.notes && (
                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>{item.notes}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
