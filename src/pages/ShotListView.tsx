// StockShot — Shot List View
// Includes per-angle tracking, look grouping, and export

import { useState } from 'react'
import useAppStore from '../store/useAppStore'
import { StockItem } from '../types'
import { exportShotListCSV } from '../lib/csvExport'
import { exportShotListPDF } from '../lib/pdfExporter'

export default function ShotListView() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'notShot' | 'shot' | 'partial'>('all')
  const [groupByLook, setGroupByLook] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const getItems = useAppStore(s => s.getItems)
  const toggleAngle = useAppStore(s => s.toggleAngle)
  const updateItem = useAppStore(s => s.updateItem)
  const getActiveShoot = useAppStore(s => s.getActiveShoot)

  const shoot = getActiveShoot()
  const allItems = getItems().filter(i => i.status === 'received' || i.status === 'dispatched' || i.shotStatus === 'shot')

  const filtered = allItems.filter(i => {
    if (filter === 'notShot' && i.shotStatus !== 'notShot') return false
    if (filter === 'shot' && i.shotStatus !== 'shot') return false
    if (filter === 'partial') {
      if (i.requiredAngles.length === 0) return false
      if (i.completedAngles.length === 0 || i.completedAngles.length === i.requiredAngles.length) return false
    }
    if (!search) return true
    const q = search.toLowerCase()
    return i.styleNumber.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)
  })

  if (!shoot) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
        <p style={{ fontSize: '40px', marginBottom: '12px' }}>🎬</p>
        <p style={{ fontWeight: 500 }}>No active shoot</p>
      </div>
    )
  }

  const looks = shoot.lookOrder.filter(l => filtered.some(i => i.looks.includes(l)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ padding: '10px 16px', background: '#F5F5F5', borderBottom: '1px solid #E0E0E0', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color: '#111' }}>Shot List</span>
        <span style={{ fontSize: '13px', color: '#666' }}>({filtered.length} items)</span>
        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #E0E0E0', borderRadius: '7px', padding: '5px 10px' }}>
          <span style={{ fontSize: '12px', color: '#888' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search..." style={{ border: 'none', outline: 'none', fontSize: '12px', width: '130px' }} />
        </div>

        <select value={filter} onChange={e => setFilter(e.target.value as any)}
          style={{ padding: '6px 8px', border: '1px solid #E0E0E0', borderRadius: '7px', fontSize: '12px' }}>
          <option value="all">All</option>
          <option value="notShot">Not Shot</option>
          <option value="partial">Partial</option>
          <option value="shot">Shot</option>
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#444', cursor: 'pointer' }}>
          <input type="checkbox" checked={groupByLook} onChange={e => setGroupByLook(e.target.checked)} />
          Group by Look
        </label>

        <button onClick={() => exportShotListCSV(filtered)} style={{ padding: '6px 12px', background: '#1C1C1E', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}>CSV</button>
        <button onClick={() => exportShotListPDF(filtered)} style={{ padding: '6px 12px', background: '#424242', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}>PDF</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#888', fontSize: '13px' }}>
            No items match your filter.
          </div>
        ) : groupByLook ? (
          looks.map(look => {
            const lookItems = filtered.filter(i => i.looks.includes(look))
            if (!lookItems.length) return null
            return (
              <div key={look}>
                <div style={{ padding: '8px 16px', background: '#EDE9FE', fontSize: '12px', fontWeight: 700, color: '#7B1FA2', borderBottom: '1px solid #E0E0E0' }}>
                  Look {look} — {lookItems.length} items
                </div>
                {lookItems.map((item, i) => (
                  <ShotRow key={item.id} item={item} index={i}
                    expanded={expandedId === item.id}
                    onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    onAngleToggle={(angle) => toggleAngle(item.id, angle)}
                    onShotStatusChange={(s) => updateItem(item.id, { shotStatus: s })} />
                ))}
              </div>
            )
          })
        ) : (
          filtered.map((item, i) => (
            <ShotRow key={item.id} item={item} index={i}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onAngleToggle={(angle) => toggleAngle(item.id, angle)}
              onShotStatusChange={(s) => updateItem(item.id, { shotStatus: s })} />
          ))
        )}
      </div>
    </div>
  )
}

function ShotRow({ item, index, expanded, onToggle, onAngleToggle, onShotStatusChange }: {
  item: StockItem
  index: number
  expanded: boolean
  onToggle: () => void
  onAngleToggle: (angle: string) => void
  onShotStatusChange: (s: any) => void
}) {
  const hasAngles = item.requiredAngles.length > 0
  const progress = hasAngles
    ? `${item.completedAngles.length}/${item.requiredAngles.length}`
    : null

  const shotColor = item.shotStatus === 'shot' ? '#7B1FA2'
    : item.shotStatus === 'notRequired' ? '#999' : '#E65100'
  const shotBg = item.shotStatus === 'shot' ? '#EDE9FE'
    : item.shotStatus === 'notRequired' ? '#F5F5F5' : '#FFF3E0'

  return (
    <div style={{ borderBottom: '1px solid #F0F0F0', background: index % 2 === 0 ? '#fff' : '#FAFAFA' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', cursor: 'pointer' }} onClick={onToggle}>
        <span style={{ width: '36px', fontSize: '11px', color: '#999', textAlign: 'center' }}>{index + 1}</span>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: '#111' }}>{item.styleNumber}</div>
          <div style={{ fontSize: '10px', color: '#888' }}>{item.description || item.sku}</div>
        </div>

        {/* Angle progress */}
        {hasAngles && (
          <div style={{ marginRight: '12px', fontSize: '11px', color: '#666' }}>
            {progress} angles
          </div>
        )}

        {/* Shot status badge */}
        <div style={{
          fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '99px',
          background: shotBg, color: shotColor, marginRight: '8px',
        }}>
          {item.shotStatus === 'shot' ? 'Shot' : item.shotStatus === 'notRequired' ? 'N/A' : 'Not Shot'}
        </div>

        <span style={{ fontSize: '12px', color: '#ccc' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded angle pills */}
      {expanded && (
        <div style={{ padding: '12px 16px 16px 52px', background: '#FAFAFA', borderTop: '1px solid #F0F0F0' }}>
          {hasAngles ? (
            <div>
              <p style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>Required angles — tap to mark as done:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {item.requiredAngles.map(angle => {
                  const done = item.completedAngles.includes(angle)
                  return (
                    <button key={angle} onClick={() => onAngleToggle(angle)} style={{
                      padding: '6px 14px', borderRadius: '99px', fontSize: '12px',
                      fontWeight: 600, cursor: 'pointer', border: 'none',
                      background: done ? '#7B1FA2' : '#F0F0F0',
                      color: done ? '#fff' : '#666',
                      transition: 'all 0.15s',
                    }}>
                      {done ? '✓ ' : ''}{angle}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <p style={{ fontSize: '11px', color: '#999', marginBottom: '12px' }}>No required angles defined for this item.</p>
          )}

          {/* Manual override */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['notShot', 'shot', 'notRequired'] as const).map(s => (
              <button key={s} onClick={() => onShotStatusChange(s)} style={{
                padding: '5px 12px', borderRadius: '6px', fontSize: '11px',
                fontWeight: 500, cursor: 'pointer', border: '1px solid #E0E0E0',
                background: item.shotStatus === s ? '#1C1C1E' : '#fff',
                color: item.shotStatus === s ? '#fff' : '#444',
              }}>
                {s === 'notShot' ? 'Not Shot' : s === 'shot' ? 'Shot' : 'N/A'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
