// StockShot — Look Builder Panel
// Slide-out panel from Shot List for managing item look assignments

import { useState } from 'react'
import { StockItem } from '../types'

interface Props {
  items: StockItem[]
  lookOrder: number[]
  onUpdateItem: (itemId: string, looks: number[]) => void
  onAddLook: () => void
  onClose: () => void
}

export default function LookBuilder({ items, lookOrder, onUpdateItem, onAddLook, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLook, setBulkLook] = useState<string>('')
  const [filterLook, setFilterLook] = useState<string>('all')
  const [receivedOnly, setReceivedOnly] = useState(true)
  const [extraFieldFilter, setExtraFieldFilter] = useState<string>('') // format: "key:value"

  // Build dynamic filter options from extraFields across all items
  const extraFieldOptions = (() => {
    const map: Record<string, Set<string>> = {}
    items.forEach(item => {
      Object.entries(item.extraFields ?? {}).forEach(([key, val]) => {
        if (!val) return
        if (!map[key]) map[key] = new Set()
        map[key].add(String(val))
      })
    })
    return map
  })()
  const hasExtraFields = Object.keys(extraFieldOptions).length > 0
  const [bulkAction, setBulkAction] = useState<'add' | 'move'>('add')

  const receivedItems = receivedOnly ? items.filter(i => i.custodyLocation === 'at_studio') : items
  const lookFiltered = filterLook === 'all' ? receivedItems : receivedItems.filter(i => 
    filterLook === 'none' ? i.looks.length === 0 : i.looks.includes(parseInt(filterLook))
  )
  const extraFiltered = extraFieldFilter
    ? lookFiltered.filter(i => {
        const [key, val] = extraFieldFilter.split(':')
        return String(i.extraFields?.[key] ?? '') === val
      })
    : lookFiltered

  const filtered = extraFiltered.filter(i => {
    if (!search) return true
    const q = search.toLowerCase()
    return i.styleNumber.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q) ||
      i.sku.toLowerCase().includes(q)
  })

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectAll() {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map(i => i.id)))
  }

  function addLookToItem(item: StockItem, look: number) {
    if (item.looks.includes(look)) return
    onUpdateItem(item.id, [...item.looks, look].sort((a, b) => a - b))
  }

  function removeLookFromItem(item: StockItem, look: number) {
    if (item.looks.length <= 1) return // keep at least one look
    onUpdateItem(item.id, item.looks.filter(l => l !== look))
  }

  function moveItemToLook(item: StockItem, look: number) {
    // Replace ALL existing looks with just this one
    onUpdateItem(item.id, [look])
  }

  function applyBulkAction() {
    if (!bulkLook) return
    let look: number
    if (bulkLook === 'new') {
      look = Math.max(0, ...allLooks) + 1
      onAddLook()
    } else {
      look = parseInt(bulkLook)
    }
    // Batch ALL updates at once to avoid stale closure issues
    const updatedItems = items.map(item => {
      if (!selectedIds.has(item.id)) return item
      if (bulkAction === 'add') {
        const newLooks = item.looks.includes(look)
          ? item.looks
          : [...item.looks, look].sort((a, b) => a - b)
        return { ...item, looks: newLooks }
      } else {
        // Move — replace ALL looks with just this one
        return { ...item, looks: [look] }
      }
    })
    // Call onUpdateItem for each changed item
    updatedItems.forEach(item => {
      const original = items.find(i => i.id === item.id)
      if (original && JSON.stringify(original.looks) !== JSON.stringify(item.looks)) {
        onUpdateItem(item.id, item.looks)
      }
    })
    setSelectedIds(new Set())
    setBulkLook('')
  }

  function handleAddNewLook() {
    onAddLook()
  }

  const allLooks = [...new Set([...lookOrder, ...items.flatMap(i => i.looks)])].sort((a, b) => a - b)

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '420px', maxWidth: '95vw',
        background: '#fff', zIndex: 201,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        animation: 'slideIn 0.2s ease',
      }}>
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E0E0E0', background: '#1C1C1E', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>Look Builder</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
              {items.length} items · {allLooks.length} look{allLooks.length !== 1 ? 's' : ''}
            </div>
          </div>
          <button onClick={handleAddNewLook} style={{
            background: '#EDE9FE', color: '#7B1FA2', border: 'none',
            padding: '6px 12px', borderRadius: '6px', fontSize: '12px',
            cursor: 'pointer', fontWeight: 600,
          }}>
            + New Look
          </button>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
            padding: '6px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer',
          }}>
            ✕
          </button>
        </div>

        {/* At Studio only toggle + Look filter */}
        <div style={{ padding: '8px 20px', borderBottom: '0.5px solid #F0F0F0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setReceivedOnly(!receivedOnly)} style={{
            padding: '5px 10px', borderRadius: '5px', fontSize: '11px',
            fontWeight: 600, cursor: 'pointer', border: 'none', flexShrink: 0,
            background: receivedOnly ? '#E8F5E9' : '#F5F5F5',
            color: receivedOnly ? '#2E7D32' : '#666',
          }}>
            {receivedOnly ? '🏠 At Studio only' : 'All items'}
          </button>
          <span style={{ fontSize: '11px', color: '#aaa' }}>
            {receivedOnly ? `${items.filter(i => i.custodyLocation === 'at_studio').length} at studio` : `${items.length} total`}
          </span>
        </div>

        {/* Look filter dropdown */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #F0F0F0', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', color: '#666', flexShrink: 0 }}>Filter by Look:</span>
          <select
            value={filterLook}
            onChange={e => { setFilterLook(e.target.value); setSelectedIds(new Set()) }}
            style={{ flex: 1, padding: '6px 10px', border: '1px solid #E0E0E0', borderRadius: '7px', fontSize: '13px', cursor: 'pointer' }}
          >
            <option value="all">All Looks ({items.length} items)</option>
            <option value="none">No Look Assigned ({items.filter(i => i.looks.length === 0).length} items)</option>
            {allLooks.map(look => {
              const count = items.filter(i => i.looks.includes(look)).length
              return <option key={look} value={String(look)}>Look {look} ({count} item{count !== 1 ? 's' : ''})</option>
            })}
          </select>
          {filterLook !== 'all' && (
            <button onClick={() => setFilterLook('all')} style={{
              background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '18px', flexShrink: 0,
            }}>✕</button>
          )}
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div style={{ padding: '10px 20px', background: '#E3F2FD', borderBottom: '1px solid #BBDEFB', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#1565C0' }}>
              {selectedIds.size} selected
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['add', 'move'] as const).map(a => (
                <button key={a} onClick={() => setBulkAction(a)} style={{
                  padding: '4px 10px', borderRadius: '5px', fontSize: '11px',
                  fontWeight: 500, cursor: 'pointer', border: 'none',
                  background: bulkAction === a ? '#1565C0' : '#fff',
                  color: bulkAction === a ? '#fff' : '#444',
                }}>
                  {a === 'add' ? 'Add to' : 'Move to'}
                </button>
              ))}
            </div>
            <select value={bulkLook} onChange={e => setBulkLook(e.target.value)}
              style={{ padding: '4px 8px', border: '1px solid #BBDEFB', borderRadius: '5px', fontSize: '12px', flex: 1 }}>
              <option value="">Select look...</option>
              {allLooks.map(l => <option key={l} value={l}>Look {l}</option>)}
              <option value="new">+ New Look</option>
            </select>
            <span style={{ fontSize: '11px', color: '#888' }}>or</span>
            <input
              type="number" min="1" placeholder="#"
              onChange={e => e.target.value ? setBulkLook(e.target.value) : setBulkLook('')}
              style={{ width: '48px', padding: '4px 6px', border: '1px solid #BBDEFB', borderRadius: '5px', fontSize: '12px' }}
            />
            <button onClick={applyBulkAction} disabled={!bulkLook} style={{
              padding: '5px 12px', background: bulkLook ? '#1565C0' : '#E0E0E0',
              color: bulkLook ? '#fff' : '#999', border: 'none',
              borderRadius: '5px', fontSize: '12px', cursor: bulkLook ? 'pointer' : 'default',
              fontWeight: 500,
            }}>
              Apply
            </button>
            <button onClick={() => setSelectedIds(new Set())} style={{
              background: 'none', border: 'none', fontSize: '12px', color: '#666', cursor: 'pointer',
            }}>
              Clear
            </button>
          </div>
        )}

        {/* Extra field filters */}
        {hasExtraFields && (
          <div style={{ padding: '8px 20px', borderBottom: '1px solid #F0F0F0', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: '#666', flexShrink: 0 }}>Filter by:</span>
            {Object.entries(extraFieldOptions).map(([key, values]) => (
              <select key={key}
                value={extraFieldFilter.startsWith(key + ':') ? extraFieldFilter : ''}
                onChange={e => setExtraFieldFilter(e.target.value)}
                style={{ padding: '4px 8px', border: '1px solid #E0E0E0', borderRadius: '5px', fontSize: '11px', cursor: 'pointer' }}>
                <option value="">{key} (all)</option>
                {[...values].sort().map(v => (
                  <option key={v} value={`${key}:${v}`}>{v}</option>
                ))}
              </select>
            ))}
            {extraFieldFilter && (
              <button onClick={() => setExtraFieldFilter('')} style={{
                background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '12px'
              }}>✕ Clear</button>
            )}
          </div>
        )}

        {/* Search */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #F0F0F0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F5F5F5', borderRadius: '7px', padding: '7px 12px' }}>
            <span style={{ fontSize: '12px', color: '#888' }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search items..."
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', flex: 1 }} />
          </div>
        </div>

        {/* Column headers */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 20px', background: '#F9F9F9', borderBottom: '1px solid #F0F0F0', gap: '10px' }}>
          <input type="checkbox"
            checked={selectedIds.size === filtered.length && filtered.length > 0}
            onChange={selectAll} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#666', flex: 1 }}>Item</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#666', width: '140px' }}>Looks</span>
        </div>

        {/* Item list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.map((item, i) => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 20px',
              borderBottom: '1px solid #F5F5F5',
              background: selectedIds.has(item.id) ? '#EEF6FF' : i % 2 === 0 ? '#fff' : '#FAFAFA',
            }}>
              <input type="checkbox" checked={selectedIds.has(item.id)}
                onChange={() => toggleSelect(item.id)} style={{ flexShrink: 0 }} />

              {/* Item info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.styleNumber}
                </div>
                <div style={{ fontSize: '10px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.description || item.sku}
                </div>
              </div>

              {/* Look pills + controls */}
              <div style={{ width: '160px', display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                {item.looks.sort((a, b) => a - b).map(look => (
                  <div key={look} style={{
                    display: 'flex', alignItems: 'center', gap: '2px',
                    background: '#EDE9FE', borderRadius: '4px',
                    padding: '2px 4px 2px 7px',
                  }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#7B1FA2' }}>L{look}</span>
                    <button
                      onClick={() => removeLookFromItem(item, look)}
                      disabled={item.looks.length <= 1}
                      title={item.looks.length <= 1 ? "Can't remove last look" : `Remove from Look ${look}`}
                      style={{
                        background: 'none', border: 'none', cursor: item.looks.length > 1 ? 'pointer' : 'default',
                        color: item.looks.length > 1 ? '#7B1FA2' : '#ccc',
                        fontSize: '11px', padding: '0 2px', lineHeight: 1,
                      }}>
                      ✕
                    </button>
                  </div>
                ))}

                {/* Add to look dropdown */}
                <select
                  value=""
                  onChange={e => {
                    const val = e.target.value
                    if (!val) return
                    if (val.startsWith('move-')) {
                      moveItemToLook(item, parseInt(val.replace('move-', '')))
                    } else {
                      addLookToItem(item, parseInt(val))
                    }
                    e.target.value = ''
                  }}
                  style={{
                    fontSize: '10px', padding: '2px 4px', border: '1px dashed #ccc',
                    borderRadius: '4px', color: '#888', background: '#fff', cursor: 'pointer',
                    maxWidth: '80px',
                  }}>
                  <option value="">+ Look</option>
                  {allLooks.filter(l => !item.looks.includes(l)).length > 0 && (
                    <optgroup label="Add to">
                      {allLooks.filter(l => !item.looks.includes(l)).map(l => (
                        <option key={`add-${l}`} value={l}>Look {l}</option>
                      ))}
                    </optgroup>
                  )}
                  {item.looks.length > 0 && allLooks.filter(l => !item.looks.includes(l)).length > 0 && (
                    <optgroup label="Move to (replaces)">
                      {allLooks.filter(l => !item.looks.includes(l)).map(l => (
                        <option key={`move-${l}`} value={`move-${l}`}>Look {l}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E0E0E0', background: '#F9F9F9', fontSize: '11px', color: '#888', textAlign: 'center' }}>
          Tap ✕ on a look pill to remove · Use "+ Look" to add · Select multiple for bulk actions
        </div>
      </div>
    </>
  )
}
