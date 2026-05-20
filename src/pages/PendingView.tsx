// StockShot — Pending / Missing Items View

import { useState } from 'react'
import useAppStore from '../store/useAppStore'
import { exportMissingItemsCSV } from '../lib/csvExport'
import { exportMissingItemsPDF } from '../lib/pdfExporter'

export default function PendingView() {
  const [search, setSearch] = useState('')
  const [sortAsc, setSortAsc] = useState(true)

  const getPending = useAppStore(s => s.getPending)
  const pendingIsMeaningful = useAppStore(s => s.pendingIsMeaningful)
  const getActiveShoot = useAppStore(s => s.getActiveShoot)

  const shoot = getActiveShoot()
  const meaningful = pendingIsMeaningful()
  const pending = getPending()

  const filtered = pending
    .filter(i => {
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

  if (!shoot) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>No active shoot.</div>
  }

  if (!meaningful) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ fontSize: '40px', marginBottom: '12px' }}>📚</p>
        <p style={{ fontSize: '15px', fontWeight: 500, color: '#111', marginBottom: '6px' }}>Reference file mode</p>
        <p style={{ fontSize: '12px', color: '#666' }}>
          This shoot was imported as a mapping reference.<br />
          Outstanding items are not tracked — scan items in freely.
        </p>
      </div>
    )
  }

  if (pending.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ fontSize: '40px', marginBottom: '12px' }}>✅</p>
        <p style={{ fontSize: '15px', fontWeight: 500, color: '#111' }}>All items scanned in!</p>
        <p style={{ fontSize: '12px', color: '#666' }}>No outstanding items remaining.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ padding: '10px 16px', background: '#F5F5F5', borderBottom: '1px solid #E0E0E0', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color: '#111' }}>Missing Items</span>
        <span style={{ background: '#E65100', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px' }}>
          {pending.length}
        </span>
        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #E0E0E0', borderRadius: '7px', padding: '5px 10px' }}>
          <span style={{ fontSize: '12px', color: '#888' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search..." style={{ border: 'none', outline: 'none', fontSize: '12px', width: '140px' }} />
        </div>

        <button onClick={() => setSortAsc(!sortAsc)} style={{ padding: '6px 10px', background: '#E0E0E0', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
          {sortAsc ? '↑' : '↓'}
        </button>

        <button onClick={() => exportMissingItemsCSV(filtered)} style={{ padding: '6px 12px', background: '#1C1C1E', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}>XLS</button>
        <button onClick={() => exportMissingItemsPDF(filtered)} style={{ padding: '6px 12px', background: '#424242', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}>PDF</button>
      </div>

      {/* Column headers */}
      <div style={{ display: 'flex', padding: '7px 16px', background: '#F5F5F5', borderBottom: '1px solid #E0E0E0', fontSize: '11px', fontWeight: 600, color: '#666' }}>
        <span style={{ width: '36px', textAlign: 'center' }}>#</span>
        <span style={{ width: '150px' }}>Style Number</span>
        <span style={{ flex: 1 }}>Description</span>
        <span style={{ width: '140px' }}>SKU</span>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
        {filtered.map((item, i) => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center',
            borderBottom: '1px solid #F5F5F5',
            background: i % 2 === 0 ? '#fff' : '#FAFAFA',
          }}>
            <div style={{ width: '3px', alignSelf: 'stretch', background: '#E65100', flexShrink: 0 }} />
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', padding: '9px 13px' }}>
              <span style={{ width: '33px', textAlign: 'center', fontSize: '11px', color: '#999' }}>{i + 1}</span>
              <span style={{ width: '150px', fontSize: '13px', color: '#111', fontWeight: 500 }}>{item.styleNumber}</span>
              <span style={{ flex: 1, fontSize: '12px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.description || '—'}
              </span>
              <span style={{ width: '140px', fontSize: '12px', color: '#888', fontFamily: 'monospace' }}>{item.sku}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
