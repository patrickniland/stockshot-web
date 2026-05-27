// StockShot — Admin: Bulk Status Change

import { useState, useMemo } from 'react'
import useAppStore from '../../store/useAppStore'
import { CustodyLocation, StockItem } from '../../types'

const LOCATIONS: { value: CustodyLocation; label: string; desc: string }[] = [
  { value: 'at_studio',  label: 'Received',   desc: 'At Studio' },
  { value: 'in_transit', label: 'In Transit',  desc: 'In Transit' },
  { value: 'at_client',  label: 'Dispatched',  desc: 'At Client' },
]

export default function BulkStatusChangeView() {
  const savedShoots = useAppStore(s => s.savedShoots)
  const bulkSetCustody = useAppStore(s => s.bulkSetCustody)
  const currentOperator = useAppStore(s => s.currentOperator)

  const activeShoots = savedShoots.filter(s => !s.deletedAt)

  const [shootFilter, setShootFilter] = useState<string>('all')
  const [targetLocation, setTargetLocation] = useState<CustodyLocation>('at_studio')
  const [recipient, setRecipient] = useState('')
  const [reason, setReason] = useState('')
  const [operator, setOperator] = useState(currentOperator)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<CustodyLocation | 'all' | 'active' | 'mapped'>('active')
  const [search, setSearch] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [done, setDone] = useState<{ count: number } | null>(null)

  const allItems = useMemo(() => {
    const shoots = shootFilter === 'all'
      ? activeShoots
      : activeShoots.filter(s => s.id === shootFilter)
    return shoots.flatMap(s => s.items.map(item => ({ item, shootName: s.name })))
  }, [savedShoots, shootFilter])

  const visibleItems = useMemo(() => {
    return allItems.filter(({ item }) => {
      const isActive = (item.custodyHistory ?? []).length > 0
      if (statusFilter === 'active' && !isActive) return false
      if (statusFilter === 'mapped' && isActive) return false
      if (statusFilter !== 'all' && statusFilter !== 'active' && statusFilter !== 'mapped' && item.custodyLocation !== statusFilter) return false
      if (statusFilter !== 'all' && statusFilter !== 'active' && statusFilter !== 'mapped' && !isActive) return false
      if (search) {
        const q = search.toLowerCase()
        if (!item.styleNumber.toLowerCase().includes(q) &&
            !item.sku.toLowerCase().includes(q) &&
            !item.description.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [allItems, statusFilter, search])

  const selectedItems = useMemo(() =>
    allItems.filter(({ item }) => selected.has(item.id)).map(x => x.item),
    [allItems, selected]
  )

  function toggleAll() {
    if (visibleItems.every(({ item }) => selected.has(item.id))) {
      setSelected(s => { const n = new Set(s); visibleItems.forEach(({ item }) => n.delete(item.id)); return n })
    } else {
      setSelected(s => { const n = new Set(s); visibleItems.forEach(({ item }) => n.add(item.id)); return n })
    }
  }

  function toggle(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function groupChanges() {
    const groups: Record<string, StockItem[]> = {}
    for (const item of selectedItems) {
      const key = item.custodyLocation
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    }
    return groups
  }

  function applyChanges() {
    const ids = selectedItems.map(i => i.id)
    const op = targetLocation === 'at_client' && recipient.trim()
      ? recipient.trim()
      : operator.trim() || 'Admin'
    bulkSetCustody(ids, targetLocation, op, reason.trim() || undefined)
    setShowConfirm(false)
    setDone({ count: ids.length })
    setSelected(new Set())
    setReason('')
    setRecipient('')
  }

  const targetLoc = LOCATIONS.find(l => l.value === targetLocation)!
  const allChecked = visibleItems.length > 0 && visibleItems.every(({ item }) => selected.has(item.id))
  const someChecked = visibleItems.some(({ item }) => selected.has(item.id))

  return (
    <div style={{ padding: '2rem', maxWidth: '900px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111', marginBottom: '6px' }}>Bulk Status Change</h2>
      <p style={{ fontSize: '12px', color: '#888', marginBottom: '2rem' }}>
        Manually override item status when scanning isn't possible.
      </p>

      {/* Step 1: Shoot filter */}
      <section style={card}>
        <h3 style={sectionHead}>1. Filter by shoot</h3>
        <select value={shootFilter} onChange={e => { setShootFilter(e.target.value); setSelected(new Set()) }} style={selectStyle}>
          <option value="all">All shoots</option>
          {activeShoots.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </section>

      {/* Step 2: Item selection */}
      <section style={card}>
        <h3 style={sectionHead}>2. Select items</h3>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search style #, SKU, description…"
            style={{ ...inputStyle, flex: 1, minWidth: '200px' }}
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} style={{ ...selectStyle, width: 'auto' }}>
            <option value="active">Active</option>
            <option value="at_studio">At Studio</option>
            <option value="in_transit">In Transit</option>
            <option value="at_client">At Client</option>
            <option value="mapped">Mapped</option>
            <option value="all">All</option>
          </select>
        </div>

        <div style={{ border: '1px solid #E0E0E0', borderRadius: '8px', overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1fr 1fr 120px', background: '#F5F5F5', borderBottom: '1px solid #E0E0E0', padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: '#666' }}>
            <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked }} onChange={toggleAll} style={{ cursor: 'pointer' }} />
            <span>Style #</span>
            <span>SKU</span>
            <span>Description</span>
            <span>Status</span>
          </div>

          {/* Rows */}
          <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {visibleItems.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>No items match</div>
            ) : visibleItems.map(({ item }) => {
              const isActive = (item.custodyHistory ?? []).length > 0
              const loc = LOCATIONS.find(l => l.value === item.custodyLocation)
              const statusLabel = isActive ? (loc?.label ?? item.custodyLocation) : 'Mapped'
              return (
                <div
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  style={{
                    display: 'grid', gridTemplateColumns: '36px 1fr 1fr 1fr 120px',
                    padding: '8px 12px', borderBottom: '1px solid #F0F0F0',
                    background: selected.has(item.id) ? '#EEF4FF' : '#fff',
                    cursor: 'pointer', fontSize: '12px', color: '#333',
                    alignItems: 'center',
                  }}
                >
                  <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer' }} />
                  <span style={{ fontWeight: 500 }}>{item.styleNumber}</span>
                  <span>{item.sku}</span>
                  <span style={{ color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || '—'}</span>
                  <span style={{ fontSize: '11px', color: isActive ? '#333' : '#999' }}>{statusLabel}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ marginTop: '8px', fontSize: '12px', color: '#888' }}>
          {selected.size} of {allItems.length} item{allItems.length !== 1 ? 's' : ''} selected
          {selected.size > 0 && (
            <button onClick={() => setSelected(new Set())} style={{ marginLeft: '10px', background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}>
              Clear selection
            </button>
          )}
        </div>
      </section>

      {/* Step 3: Target status */}
      <section style={card}>
        <h3 style={sectionHead}>3. Target status</h3>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
          {LOCATIONS.map(loc => (
            <button
              key={loc.value}
              onClick={() => setTargetLocation(loc.value)}
              style={{
                padding: '9px 18px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
                border: `2px solid ${targetLocation === loc.value ? '#1C1C1E' : '#E0E0E0'}`,
                background: targetLocation === loc.value ? '#1C1C1E' : '#fff',
                color: targetLocation === loc.value ? '#fff' : '#555',
                fontWeight: targetLocation === loc.value ? 600 : 400,
              }}
            >
              {loc.label}
              <div style={{ fontSize: '10px', opacity: 0.7, fontWeight: 400 }}>{loc.desc}</div>
            </button>
          ))}
        </div>

        {targetLocation === 'at_client' && (
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Recipient name</label>
            <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="e.g. Courier Co" style={inputStyle} />
          </div>
        )}

        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Operator</label>
          <input value={operator} onChange={e => setOperator(e.target.value)} placeholder="Your name" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Reason (optional)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Bulk dispatch — invoice #2451" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
        </div>
      </section>

      {done && (
        <div style={{ background: '#E8F5E9', border: '1px solid #A5D6A7', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#2E7D32', fontWeight: 600 }}>
          ✓ {done.count} item{done.count !== 1 ? 's' : ''} updated.
        </div>
      )}

      <button
        onClick={() => { setDone(null); setShowConfirm(true) }}
        disabled={selected.size === 0}
        style={{
          padding: '10px 24px', background: selected.size > 0 ? '#1C1C1E' : '#E0E0E0',
          color: selected.size > 0 ? '#fff' : '#999',
          border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
          cursor: selected.size > 0 ? 'pointer' : 'default',
        }}
      >
        Apply to {selected.size} item{selected.size !== 1 ? 's' : ''}
      </button>

      {/* Confirmation modal */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '28px 32px', width: '400px', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111', marginBottom: '14px' }}>Confirm bulk change</h3>
            <p style={{ fontSize: '13px', color: '#555', marginBottom: '12px' }}>
              You are about to change <strong>{selectedItems.length} items</strong> → <strong>{targetLoc.label}</strong>
              {targetLocation === 'at_client' && recipient ? ` (to: "${recipient}")` : ''}.
            </p>
            {Object.entries(groupChanges()).map(([from, items]) => {
              const fromLoc = LOCATIONS.find(l => l.value === from)
              return (
                <div key={from} style={{ fontSize: '12px', color: '#555', marginBottom: '4px' }}>
                  · {items.length} from <strong>{fromLoc?.label ?? from}</strong> → <strong>{targetLoc.label}</strong>
                </div>
              )
            })}
            {reason && (
              <p style={{ fontSize: '12px', color: '#888', marginTop: '10px', fontStyle: 'italic' }}>
                Reason: "{reason}"
              </p>
            )}
            <p style={{ fontSize: '11px', color: '#B71C1C', marginTop: '12px' }}>
              This cannot be undone via scanning.
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={applyChanges} style={{ padding: '9px 20px', background: '#1C1C1E', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Apply Changes
              </button>
              <button onClick={() => setShowConfirm(false)} style={{ padding: '9px 16px', background: 'transparent', border: '1px solid #E0E0E0', borderRadius: '8px', fontSize: '13px', color: '#555', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E0E0E0', borderRadius: '12px', padding: '20px', marginBottom: '1.5rem' }
const sectionHead: React.CSSProperties = { fontSize: '14px', fontWeight: 700, color: '#111', marginBottom: '14px' }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: '#666', marginBottom: '5px' }
const inputStyle: React.CSSProperties = { padding: '7px 10px', fontSize: '13px', border: '1px solid #E0E0E0', borderRadius: '6px', outline: 'none' }
const selectStyle: React.CSSProperties = { padding: '7px 10px', fontSize: '13px', border: '1px solid #E0E0E0', borderRadius: '6px', background: '#fff', cursor: 'pointer', width: '100%' }
