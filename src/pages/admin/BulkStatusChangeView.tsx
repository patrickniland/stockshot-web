// StockShot — Admin: Bulk Status Change

import { useState, useMemo } from 'react'
import { CheckCircle } from '@phosphor-icons/react'
import useAppStore from '../../store/useAppStore'
import { CustodyLocation, StockItem } from '../../types'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'

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
    <div className="p-8 max-w-[900px]">
      <h2 className="text-[18px] font-bold text-neutral-900 mb-1.5">Bulk Status Change</h2>
      <p className="text-[12px] text-neutral-400 mb-8">
        Manually override item status when scanning isn't possible.
      </p>

      {/* Step 1: Shoot filter */}
      <Card padding="md" className="mb-6">
        <h3 className="text-[14px] font-bold text-neutral-900 mb-3.5">1. Filter by shoot</h3>
        <select
          value={shootFilter}
          onChange={e => { setShootFilter(e.target.value); setSelected(new Set()) }}
          className="w-full px-2.5 py-1.5 text-[13px] border border-[var(--color-border)] rounded-md bg-white cursor-pointer"
        >
          <option value="all">All shoots</option>
          {activeShoots.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Card>

      {/* Step 2: Item selection */}
      <Card padding="md" className="mb-6">
        <h3 className="text-[14px] font-bold text-neutral-900 mb-3.5">2. Select items</h3>
        <div className="flex gap-2.5 mb-3 flex-wrap">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search style #, SKU, description..."
            className="flex-1 min-w-[200px] px-2.5 py-1.5 text-[13px] border border-[var(--color-border)] rounded-md outline-none"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-2.5 py-1.5 text-[13px] border border-[var(--color-border)] rounded-md bg-white cursor-pointer"
          >
            <option value="active">Active</option>
            <option value="at_studio">At Studio</option>
            <option value="in_transit">In Transit</option>
            <option value="at_client">At Client</option>
            <option value="mapped">Mapped</option>
            <option value="all">All</option>
          </select>
        </div>

        <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid gap-0 bg-[var(--color-surface-muted)] border-b border-[var(--color-border)] px-3 py-2 text-[11px] font-semibold text-neutral-500"
            style={{ gridTemplateColumns: '36px 1fr 1fr 1fr 120px' }}>
            <input
              type="checkbox"
              checked={allChecked}
              ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
              onChange={toggleAll}
              className="cursor-pointer"
            />
            <span>Style #</span>
            <span>SKU</span>
            <span>Description</span>
            <span>Status</span>
          </div>

          {/* Rows */}
          <div className="max-h-80 overflow-y-auto">
            {visibleItems.length === 0 ? (
              <div className="p-6 text-center text-neutral-300 text-[13px]">No items match</div>
            ) : visibleItems.map(({ item }) => {
              const isActive = (item.custodyHistory ?? []).length > 0
              const loc = LOCATIONS.find(l => l.value === item.custodyLocation)
              const statusLabel = isActive ? (loc?.label ?? item.custodyLocation) : 'Mapped'
              return (
                <div
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  className={`grid px-3 py-2 border-b border-[var(--color-border)]/50 cursor-pointer text-[12px] text-neutral-700 items-center ${
                    selected.has(item.id) ? 'bg-[var(--color-info)]/10' : 'bg-white'
                  }`}
                  style={{ gridTemplateColumns: '36px 1fr 1fr 1fr 120px' }}
                >
                  <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} onClick={e => e.stopPropagation()} className="cursor-pointer" />
                  <span className="font-medium">{item.styleNumber}</span>
                  <span>{item.sku}</span>
                  <span className="text-neutral-500 truncate">{item.description || '—'}</span>
                  <span className={`text-[11px] ${isActive ? 'text-neutral-700' : 'text-neutral-300'}`}>{statusLabel}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-2 text-[12px] text-neutral-400">
          {selected.size} of {allItems.length} item{allItems.length !== 1 ? 's' : ''} selected
          {selected.size > 0 && (
            <button onClick={() => setSelected(new Set())} className="ml-2.5 bg-transparent border-none text-neutral-400 cursor-pointer text-[12px] underline">
              Clear selection
            </button>
          )}
        </div>
      </Card>

      {/* Step 3: Target status */}
      <Card padding="md" className="mb-6">
        <h3 className="text-[14px] font-bold text-neutral-900 mb-3.5">3. Target status</h3>
        <div className="flex gap-2.5 mb-3.5">
          {LOCATIONS.map(loc => (
            <button
              key={loc.value}
              onClick={() => setTargetLocation(loc.value)}
              className={`flex-1 py-2.5 px-4 rounded-[var(--radius-md)] text-[13px] cursor-pointer border-2 transition-colors ${
                targetLocation === loc.value
                  ? 'border-[var(--color-brand)] bg-[var(--color-brand)] text-white font-semibold'
                  : 'border-[var(--color-border)] bg-white text-neutral-600 font-normal'
              }`}
            >
              {loc.label}
              <div className="text-[10px] opacity-70 font-normal">{loc.desc}</div>
            </button>
          ))}
        </div>

        {targetLocation === 'at_client' && (
          <div className="mb-3">
            <label className="block text-[11px] font-semibold text-neutral-500 mb-1">Recipient name</label>
            <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="e.g. Courier Co"
              className="px-2.5 py-1.5 text-[13px] border border-[var(--color-border)] rounded-md outline-none" />
          </div>
        )}

        <div className="mb-3">
          <label className="block text-[11px] font-semibold text-neutral-500 mb-1">Operator</label>
          <input value={operator} onChange={e => setOperator(e.target.value)} placeholder="Your name"
            className="px-2.5 py-1.5 text-[13px] border border-[var(--color-border)] rounded-md outline-none" />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-neutral-500 mb-1">Reason (optional)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Bulk dispatch — invoice #2451"
            className="w-full px-2.5 py-1.5 text-[13px] border border-[var(--color-border)] rounded-md outline-none box-border" />
        </div>
      </Card>

      {done && (
        <div className="flex items-center gap-2 bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 rounded-[var(--radius-md)] px-4 py-3 mb-4 text-[13px] text-[var(--color-success)] font-semibold">
          <CheckCircle size={16} weight="fill" />
          {done.count} item{done.count !== 1 ? 's' : ''} updated.
        </div>
      )}

      <Button
        variant="primary"
        size="md"
        onClick={() => { setDone(null); setShowConfirm(true) }}
        disabled={selected.size === 0}
      >
        Apply to {selected.size} item{selected.size !== 1 ? 's' : ''}
      </Button>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]">
          <Card padding="lg" className="w-[400px] shadow-[0_8px_40px_rgba(0,0,0,0.18)]">
            <h3 className="text-[16px] font-bold text-neutral-900 mb-3.5">Confirm bulk change</h3>
            <p className="text-[13px] text-neutral-600 mb-3">
              You are about to change <strong>{selectedItems.length} items</strong> → <strong>{targetLoc.label}</strong>
              {targetLocation === 'at_client' && recipient ? ` (to: "${recipient}")` : ''}.
            </p>
            {Object.entries(groupChanges()).map(([from, items]) => {
              const fromLoc = LOCATIONS.find(l => l.value === from)
              return (
                <div key={from} className="text-[12px] text-neutral-600 mb-1">
                  · {items.length} from <strong>{fromLoc?.label ?? from}</strong> → <strong>{targetLoc.label}</strong>
                </div>
              )
            })}
            {reason && (
              <p className="text-[12px] text-neutral-400 mt-2.5 italic">Reason: "{reason}"</p>
            )}
            <p className="text-[11px] text-[var(--color-danger)] mt-3">
              This cannot be undone via scanning.
            </p>
            <div className="flex gap-2.5 mt-5">
              <Button variant="primary" size="sm" onClick={applyChanges}>Apply Changes</Button>
              <Button variant="secondary" size="sm" onClick={() => setShowConfirm(false)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
