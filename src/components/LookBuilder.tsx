// StockShot — Look Builder Panel
// Slide-out panel from Shot List for managing item look assignments

import { useState } from 'react'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { StockItem } from '../types'
import { useNavSync } from '../hooks/useNavSync'
import { Button } from './ui/Button'

interface Props {
  items: StockItem[]
  lookOrder: number[]
  onUpdateItem: (itemId: string, looks: number[]) => void
  onAddLook: () => void
  onClose: () => void
}

export default function LookBuilder({ items, lookOrder, onUpdateItem, onAddLook, onClose }: Props) {
  useNavSync({ onEnter: 'pull', onLeave: 'push' })
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLook, setBulkLook] = useState<string>('')
  const [filterLook, setFilterLook] = useState<string>('all')
  type LocationFilter = 'all' | 'at_studio' | 'at_client' | 'in_transit'
  const [locationFilter, setLocationFilter] = useState<LocationFilter>(() =>
    items.some(i => i.custodyLocation === 'at_studio') ? 'at_studio' : 'all'
  )
  const [extraFieldFilter, setExtraFieldFilter] = useState<string>('')
  // ── Item filtering ─────────────────────────────────────────────────────────

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
  const [bulkAction, setBulkAction] = useState<'add' | 'move' | 'remove'>('add')

  const receivedItems = locationFilter === 'all' ? items : items.filter(i => i.custodyLocation === locationFilter)
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

  const allLooks = [...new Set([...lookOrder, ...items.flatMap(i => i.looks)])].sort((a, b) => a - b)

  // ── Selection + bulk actions ───────────────────────────────────────────────

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
    onUpdateItem(item.id, item.looks.filter(l => l !== look))
  }

  function moveItemToLook(item: StockItem, look: number) {
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
    const updatedItems = items.map(item => {
      if (!selectedIds.has(item.id)) return item
      if (bulkAction === 'add') {
        const newLooks = item.looks.includes(look)
          ? item.looks
          : [...item.looks, look].sort((a, b) => a - b)
        return { ...item, looks: newLooks }
      } else if (bulkAction === 'move') {
        return { ...item, looks: [look] }
      } else {
        return { ...item, looks: item.looks.filter(l => l !== look) }
      }
    })
    updatedItems.forEach(item => {
      const original = items.find(i => i.id === item.id)
      if (original && JSON.stringify(original.looks) !== JSON.stringify(item.looks)) {
        onUpdateItem(item.id, item.looks)
      }
    })
    setSelectedIds(new Set())
    setBulkLook('')
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} className="fixed inset-0 bg-black/30 z-[200]" />

      {/* Panel */}
      <div className="fixed top-0 right-0 bottom-0 w-[420px] max-w-[95vw] bg-[var(--color-surface)] z-[201] flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.15)] [animation:slideIn_0.2s_ease]">
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>

        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-brand)] flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[15px] font-bold text-white">Look Builder</div>
            <div className="text-[11px] text-neutral-400 mt-0.5">
              {items.length} items · {allLooks.length} look{allLooks.length !== 1 ? 's' : ''}
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={onAddLook}>+ New Look</Button>
          <button
            onClick={onClose}
            className="bg-white/10 border-none text-white px-3 py-1.5 rounded-md cursor-pointer hover:bg-white/20 transition-colors flex items-center"
          >
            <X size={14} />
          </button>
        </div>

        {/* Location filter pills */}
        <div className="px-5 py-2 border-b border-[var(--color-border)]/50 flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-neutral-500 mr-0.5">Location:</span>
          {([
            { value: 'all',        label: 'All' },
            { value: 'at_studio',  label: 'At Studio' },
            { value: 'at_client',  label: 'At Client' },
            { value: 'in_transit', label: 'In Transit' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => setLocationFilter(opt.value)}
              className={`px-2.5 py-2 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer min-h-[36px] ${
                locationFilter === opt.value
                  ? 'border-[var(--color-info)] bg-[var(--color-info)]/10 text-[var(--color-info)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-muted)] text-neutral-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Look filter dropdown */}
        <div className="px-5 py-2.5 border-b border-[var(--color-border)] flex items-center gap-2.5">
          <span className="text-[12px] text-neutral-500 shrink-0">Filter by Look:</span>
          <select
            value={filterLook}
            onChange={e => { setFilterLook(e.target.value); setSelectedIds(new Set()) }}
            className="flex-1 px-2.5 py-1.5 border border-[var(--color-border)] rounded-lg text-[13px] cursor-pointer bg-white"
          >
            <option value="all">All Looks ({items.length} items)</option>
            <option value="none">No Look Assigned ({items.filter(i => i.looks.length === 0).length} items)</option>
            {allLooks.map(look => {
              const count = items.filter(i => i.looks.includes(look)).length
              return <option key={look} value={String(look)}>Look {look} ({count} item{count !== 1 ? 's' : ''})</option>
            })}
          </select>
          {filterLook !== 'all' && (
            <button
              onClick={() => setFilterLook('all')}
              className="bg-transparent border-none text-neutral-400 cursor-pointer shrink-0 flex items-center hover:text-neutral-600"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="px-5 py-2.5 bg-[var(--color-info)]/10 border-b border-[var(--color-info)]/30 flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-semibold text-[var(--color-info)]">
              {selectedIds.size} selected
            </span>
            <div className="flex gap-1.5">
              {(['add', 'move', 'remove'] as const).map(a => (
                <button
                  key={a}
                  onClick={() => setBulkAction(a)}
                  className={`px-2.5 py-2 rounded-md text-[11px] font-medium cursor-pointer border-none transition-colors min-h-[36px] ${
                    bulkAction === a
                      ? 'bg-[var(--color-info)] text-white'
                      : 'bg-white text-neutral-500'
                  }`}
                >
                  {a === 'add' ? 'Add to' : a === 'move' ? 'Move to' : 'Remove from'}
                </button>
              ))}
            </div>
            <select
              value={bulkLook}
              onChange={e => setBulkLook(e.target.value)}
              className="px-2 py-1 border border-[var(--color-info)]/30 rounded-md text-[12px] flex-1 bg-white"
            >
              <option value="">Select look...</option>
              {allLooks.map(l => <option key={l} value={l}>Look {l}</option>)}
              {bulkAction !== 'remove' && <option value="new">+ New Look</option>}
            </select>
            <span className="text-[11px] text-neutral-400">or</span>
            <input
              type="number" min="1" placeholder="#"
              onChange={e => e.target.value ? setBulkLook(e.target.value) : setBulkLook('')}
              className="w-12 px-1.5 py-1 border border-[var(--color-info)]/30 rounded-md text-[12px]"
            />
            <Button variant="primary" size="sm" onClick={applyBulkAction} disabled={!bulkLook}>Apply</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        )}

        {/* Extra field filters */}
        {hasExtraFields && (
          <div className="px-5 py-2 border-b border-[var(--color-border)] flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-neutral-500 shrink-0">Filter by:</span>
            {Object.entries(extraFieldOptions).map(([key, values]) => (
              <select
                key={key}
                value={extraFieldFilter.startsWith(key + ':') ? extraFieldFilter : ''}
                onChange={e => setExtraFieldFilter(e.target.value)}
                className="px-2 py-1 border border-[var(--color-border)] rounded-md text-[11px] cursor-pointer bg-white"
              >
                <option value="">{key} (all)</option>
                {[...values].sort().map(v => (
                  <option key={v} value={`${key}:${v}`}>{v}</option>
                ))}
              </select>
            ))}
            {extraFieldFilter && (
              <button
                onClick={() => setExtraFieldFilter('')}
                className="bg-transparent border-none text-neutral-400 cursor-pointer text-[12px] flex items-center gap-0.5 hover:text-neutral-600"
              >
                <X size={12} /> Clear
              </button>
            )}
          </div>
        )}

        {/* Search */}
        <div className="px-5 py-2.5 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 bg-[var(--color-surface-muted)] rounded-lg px-3 py-1.5">
            <MagnifyingGlass size={14} className="text-neutral-400 shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search items..."
              className="border-none bg-transparent outline-none text-[13px] flex-1"
            />
          </div>
        </div>

        {/* Column headers */}
        <div className="flex items-center px-5 py-1.5 bg-[var(--color-surface-muted)] border-b border-[var(--color-border)] gap-2.5">
          <input
            type="checkbox"
            checked={selectedIds.size === filtered.length && filtered.length > 0}
            onChange={selectAll}
          />
          <span className="text-[11px] font-semibold text-neutral-500 flex-1">Item</span>
          <span className="text-[11px] font-semibold text-neutral-500 w-40">Looks</span>
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && locationFilter !== 'all' && (
            <div className="p-8 text-center">
              <div className="text-[13px] text-neutral-500 mb-2">
                {items.some(i => i.custodyLocation === locationFilter)
                  ? 'No items here match the current filters.'
                  : locationFilter === 'at_studio' ? 'No items have been scanned to studio yet.'
                  : locationFilter === 'at_client' ? 'No items are currently at client.'
                  : 'No items are currently in transit.'}
              </div>
              <Button variant="secondary" size="sm" onClick={() => setLocationFilter('all')}>
                Show all items
              </Button>
            </div>
          )}
          {filtered.map((item, i) => (
            <div
              key={item.id}
              className={`flex items-center gap-2.5 px-5 py-2.5 border-b border-[var(--color-border)]/50 ${
                selectedIds.has(item.id)
                  ? 'bg-[var(--color-info)]/10'
                  : i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-surface-muted)]'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => toggleSelect(item.id)}
                className="shrink-0"
              />

              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-neutral-900 truncate">
                  {item.styleNumber}
                </div>
                <div className="text-[10px] text-neutral-400 truncate">
                  {item.description || item.sku}
                </div>
              </div>

              {/* Look pills + controls */}
              <div className="w-40 flex flex-wrap gap-1 items-center">
                {item.looks.sort((a, b) => a - b).map(look => (
                  <div
                    key={look}
                    className="flex items-center gap-0.5 bg-[var(--color-accent)]/10 rounded px-1.5 py-0.5"
                  >
                    <span className="text-[10px] font-bold text-[var(--color-accent)]">L{look}</span>
                    <button
                      onClick={() => removeLookFromItem(item, look)}
                      title={`Remove from Look ${look}`}
                      className="bg-transparent border-none cursor-pointer text-[var(--color-accent)] px-0.5 leading-none flex items-center hover:opacity-70"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}

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
                  className="text-[10px] px-1 py-0.5 border border-dashed border-[var(--color-border)] rounded text-neutral-400 bg-white cursor-pointer max-w-[80px]"
                >
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
        <div className="px-5 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[11px] text-neutral-400 text-center">
          Tap × on a look pill to remove · Use "+ Look" to add · Select items for bulk add / move / remove
        </div>
      </div>
    </>
  )
}
