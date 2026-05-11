// StockShot — Stock List View (fixed immediate state updates)

import { useState } from 'react'
import useAppStore from '../store/useAppStore'
import { StockItem, ItemStatus, ShotStatus } from '../types'
import { exportStockListCSV } from '../lib/csvExport'
import { exportStockListPDF } from '../lib/pdfExporter'

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

  // Use direct store access to avoid stale closure
  const savedShoots = useAppStore(s => s.savedShoots)
  const activeShootId = useAppStore(s => s.activeShootId)
  const updateShootItems = useAppStore(s => s.updateShootItems)

  const activeShoot = savedShoots.find(s => s.id === activeShootId) ?? null
  const allItems = activeShoot?.items ?? []

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

  function updateItemStatus(itemId: string, status: ItemStatus) {
    if (!activeShoot) return
    const updated = activeShoot.items.map(i => i.id === itemId ? { ...i, status } : i)
    updateShootItems(updated)
  }

  function updateItemShotStatus(itemId: string, shotStatus: ShotStatus) {
    if (!activeShoot) return
    const updated = activeShoot.items.map(i => i.id === itemId ? { ...i, shotStatus } : i)
    updateShootItems(updated)
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
      <div style={{ padding: '10px 16px', background: '#F5F5F5', borderBottom: '1px solid #E0E0E0', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color: '#111' }}>Stock List</span>
        <span style={{ fontSize: '13px', color: '#666' }}>({filtered.length} of {allItems.length})</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #E0E0E0', borderRadius: '7px', padding: '5px 10px' }}>
          <span style={{ fontSize: '12px', color: '#888' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search..." style={{ border: 'none', outline: 'none', fontSize: '12px', width: '150px' }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
          style={{ padding: '6px 8px', border: '1px solid #E0E0E0', borderRadius: '7px', fontSize: '12px' }}>
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="received">Received</option>
          <option value="dispatched">Dispatched</option>
        </select>
        <button onClick={() => setSortAsc(!sortAsc)} style={{ padding: '6px 10px', background: '#E0E0E0', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
          {sortAsc ? '↑' : '↓'}
        </button>
        <button onClick={() => exportStockListCSV(filtered)} style={{ padding: '6px 12px', background: '#1C1C1E', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}>CSV</button>
        <button onClick={() => exportStockListPDF(filtered)} style={{ padding: '6px 12px', background: '#424242', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}>PDF</button>
      </div>

      {/* Column headers */}
      <div style={{ display: 'flex', padding: '7px 16px', background: '#F5F5F5', borderBottom: '1px solid #E0E0E0', fontSize: '11px', fontWeight: 600, color: '#666' }}>
        <span style={{ width: '36px', textAlign: 'center' }}>#</span>
        <span style={{ flex: 1 }}>Style / SKU</span>
        <span style={{ width: '140px' }}>Description</span>
        <span style={{ width: '130px' }}>Status</span>
        <span style={{ width: '100px' }}>Shot</span>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#888', fontSize: '13px' }}>
            No items match your search.
          </div>
        ) : filtered.map((item, i) => (
          <StockRow
            key={item.id}
            item={item}
            index={i}
            onStatusChange={status => updateItemStatus(item.id, status)}
            onShotChange={shotStatus => updateItemShotStatus(item.id, shotStatus)}
          />
        ))}
      </div>
    </div>
  )
}

function StockRow({ item, index, onStatusChange, onShotChange }: {
  item: StockItem
  index: number
  onStatusChange: (s: ItemStatus) => void
  onShotChange: (s: ShotStatus) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', padding: '9px 16px',
      borderBottom: '1px solid #F5F5F5',
      background: index % 2 === 0 ? '#fff' : '#FAFAFA',
    }}>
      <span style={{ width: '36px', textAlign: 'center', fontSize: '11px', color: '#999' }}>{index + 1}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: '#111' }}>{item.styleNumber}</div>
        <div style={{ fontSize: '10px', color: '#888', fontFamily: 'monospace' }}>{item.sku}</div>
      </div>
      <div style={{ width: '140px', fontSize: '11px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.description || '—'}
      </div>
      <div style={{ width: '130px' }}>
        <select
          value={item.status}
          onChange={e => onStatusChange(e.target.value as ItemStatus)}
          style={{
            fontSize: '11px', fontWeight: 600, padding: '4px 8px', borderRadius: '99px',
            border: `1px solid ${STATUS_COLORS[item.status]}33`,
            cursor: 'pointer', background: STATUS_BG[item.status], color: STATUS_COLORS[item.status],
            appearance: 'auto',
          }}>
          <option value="pending">Pending</option>
          <option value="received">Received</option>
          <option value="dispatched">Dispatched</option>
          <option value="flagged">Flagged</option>
        </select>
      </div>
      <div style={{ width: '100px' }}>
        <select
          value={item.shotStatus}
          onChange={e => onShotChange(e.target.value as ShotStatus)}
          style={{
            fontSize: '11px', fontWeight: 600, padding: '4px 8px', borderRadius: '99px',
            border: '1px solid #E0E0E0', cursor: 'pointer', appearance: 'auto',
            background: item.shotStatus === 'shot' ? '#EDE9FE' : item.shotStatus === 'notRequired' ? '#F5F5F5' : '#FFF3E0',
            color: item.shotStatus === 'shot' ? '#7B1FA2' : item.shotStatus === 'notRequired' ? '#999' : '#E65100',
          }}>
          <option value="notShot">Not Shot</option>
          <option value="shot">Shot</option>
          <option value="notRequired">N/A</option>
        </select>
      </div>
    </div>
  )
}
