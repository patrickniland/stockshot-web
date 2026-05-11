// StockShot — Stock List View
// Full version: QR codes, look column, bulk product type assignment, instant state updates

import { useState } from 'react'
import useAppStore from '../store/useAppStore'
import { StockItem, ItemStatus, ShotStatus } from '../types'
import { exportStockListCSV } from '../lib/csvExport'
import { exportStockListPDF } from '../lib/pdfExporter'
import QRCode from '../components/QRCode'

const STATUS_COLORS: Record<ItemStatus, string> = {
  pending: '#E65100', received: '#2E7D32', dispatched: '#1565C0', flagged: '#B71C1C',
}
const STATUS_BG: Record<ItemStatus, string> = {
  pending: '#FFF3E0', received: '#E8F5E9', dispatched: '#E3F2FD', flagged: '#FFEBEE',
}

export default function StockListView() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ItemStatus | 'all'>('all')
  const [sortAsc, setSortAsc] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [bulkProductType, setBulkProductType] = useState('')

  const savedShoots = useAppStore(s => s.savedShoots)
  const activeShootId = useAppStore(s => s.activeShootId)
  const updateShootItems = useAppStore(s => s.updateShootItems)
  const clients = useAppStore(s => s.clients)

  const activeShoot = savedShoots.find(s => s.id === activeShootId) ?? null
  const allItems = activeShoot?.items ?? []
  const client = clients.find(c => c.id === activeShoot?.clientId) ?? null
  const productTypes = client?.productTypes ?? []

  const filtered = allItems
    .filter(i => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false
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
    const updated = activeShoot.items.map(i => i.id === itemId ? { ...i, ...updates } : i)
    updateShootItems(updated)
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(i => i.id)))
    }
  }

  function applyBulkProductType() {
    if (!bulkProductType || !activeShoot || selectedIds.size === 0) return
    const pt = productTypes.find(p => p.name === bulkProductType)
    const requiredAngles = pt?.requiredAngles.map(a => a.name) ?? []
    const updated = activeShoot.items.map(i =>
      selectedIds.has(i.id) ? { ...i, productType: bulkProductType, requiredAngles, completedAngles: [] } : i
    )
    updateShootItems(updated)
    setSelectedIds(new Set())
    setBulkProductType('')
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Toolbar */}
      <div style={{ padding: '10px 16px', background: '#F5F5F5', borderBottom: '1px solid #E0E0E0', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color: '#111' }}>Stock List</span>
        <span style={{ fontSize: '13px', color: '#666' }}>({filtered.length} of {allItems.length})</span>
        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #E0E0E0', borderRadius: '7px', padding: '5px 10px' }}>
          <span style={{ fontSize: '12px', color: '#888' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search..." style={{ border: 'none', outline: 'none', fontSize: '12px', width: '140px' }} />
        </div>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
          style={{ padding: '6px 8px', border: '1px solid #E0E0E0', borderRadius: '7px', fontSize: '12px' }}>
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="received">Received</option>
          <option value="dispatched">Dispatched</option>
        </select>

        <button onClick={() => setSortAsc(!sortAsc)} style={{ padding: '6px 10px', background: '#E0E0E0', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
          {sortAsc ? '↑' : '↓'}
        </button>
        <button onClick={() => exportStockListCSV(filtered)} style={{ padding: '6px 10px', background: '#F5F5F5', border: '1px solid #E0E0E0', color: '#444', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}>CSV</button>
        <button onClick={() => exportStockListPDF(filtered)} style={{ padding: '6px 10px', background: '#424242', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}>PDF</button>
      </div>

      {/* Bulk assignment bar */}
      {selectedIds.size > 0 && productTypes.length > 0 && (
        <div style={{ padding: '8px 16px', background: '#E3F2FD', borderBottom: '1px solid #BBDEFB', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#1565C0' }}>{selectedIds.size} selected</span>
          <select value={bulkProductType} onChange={e => setBulkProductType(e.target.value)}
            style={{ padding: '5px 8px', border: '1px solid #BBDEFB', borderRadius: '6px', fontSize: '12px', flex: 1, maxWidth: '200px' }}>
            <option value="">Assign product type...</option>
            {productTypes.map(pt => <option key={pt.id} value={pt.name}>{pt.name}</option>)}
          </select>
          <button onClick={applyBulkProductType} disabled={!bulkProductType} style={{
            padding: '5px 14px', background: bulkProductType ? '#1565C0' : '#E0E0E0',
            color: bulkProductType ? '#fff' : '#999', border: 'none', borderRadius: '6px',
            fontSize: '12px', cursor: bulkProductType ? 'pointer' : 'default', fontWeight: 500,
          }}>
            Apply
          </button>
          <button onClick={() => setSelectedIds(new Set())} style={{ padding: '5px 10px', background: 'none', border: 'none', fontSize: '12px', color: '#666', cursor: 'pointer' }}>
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
        <span style={{ width: '120px' }}>Status</span>
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

              {/* Status */}
              <div style={{ width: '120px' }}>
                <select value={item.status} onChange={e => updateItemField(item.id, { status: e.target.value as ItemStatus })}
                  style={{
                    fontSize: '11px', fontWeight: 600, padding: '4px 6px', borderRadius: '99px',
                    border: `1px solid ${STATUS_COLORS[item.status]}44`,
                    cursor: 'pointer', background: STATUS_BG[item.status], color: STATUS_COLORS[item.status],
                    appearance: 'auto', width: '100%',
                  }}>
                  <option value="pending">Pending</option>
                  <option value="received">Received</option>
                  <option value="dispatched">Dispatched</option>
                  <option value="flagged">Flagged</option>
                </select>
              </div>

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

            {/* Expanded QR row */}
            {expandedId === item.id && (
              <div style={{ padding: '12px 16px 14px 60px', background: '#F8F8F8', borderBottom: '1px solid #F0F0F0', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <QRCode value={item.qrCodeValue} size={80} />
                <div>
                  <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>QR Value</div>
                  <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#444' }}>{item.qrCodeValue}</div>
                  {item.notes && <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>{item.notes}</div>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
